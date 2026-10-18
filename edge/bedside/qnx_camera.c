/* QNX Sensor Framework -> Python, one camera per process.
 * The callback keeps only the latest frame, so slow inference cannot queue video.
 * Camera API: https://qnx.github.io/codelabs/mediapipe-camera-sample/
 * Build: gcc -shared -fPIC -O2 -o build/libcarecall_camera.so qnx_camera.c -lcamapi
 */
#include <camera/camera_api.h>
#include <errno.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAX_FRAME (32 * 1024 * 1024)
static camera_handle_t handle = CAMERA_HANDLE_INVALID;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static unsigned char *latest;
static uint32_t details[6]; /* width, height, stride, UV offset, UV stride, format */
static size_t latest_size;
static int ready, failure;

static void frame_ready(camera_handle_t camera, camera_buffer_t *frame, void *arg) {
    (void)camera;
    (void)arg;
    pthread_mutex_lock(&lock);
    uint64_t bytes = 0;
    if (frame->frametype == CAMERA_FRAMETYPE_NV12) {
        details[0] = frame->framedesc.nv12.width;
        details[1] = frame->framedesc.nv12.height;
        details[2] = frame->framedesc.nv12.stride;
        details[3] = frame->framedesc.nv12.uv_offset;
        details[4] = frame->framedesc.nv12.uv_stride;
        details[5] = 1;
        if (frame->framedesc.nv12.uv_offset < 0 || frame->framedesc.nv12.uv_stride < 0)
            failure = EINVAL;
        bytes = (uint64_t)details[3] + (uint64_t)(details[1] / 2) * details[4];
    } else if (frame->frametype == CAMERA_FRAMETYPE_YCBYCR) {
        details[0] = frame->framedesc.ycbycr.width;
        details[1] = frame->framedesc.ycbycr.height;
        details[2] = frame->framedesc.ycbycr.stride;
        details[3] = details[4] = 0;
        details[5] = 2;
        bytes = (uint64_t)details[1] * details[2];
    } else {
        failure = ENOTSUP;
    }
    /* QNX framesize is sizeof(camera_buffer_t), NOT the pixel data length. */
    if (bytes == 0 || bytes > MAX_FRAME || !frame->framebuf) failure = EOVERFLOW;
    if (!failure) {
        latest_size = (size_t)bytes;
        memcpy(latest, frame->framebuf, latest_size);
        ready = 1;
    }
    pthread_cond_signal(&changed);
    pthread_mutex_unlock(&lock);
}

void carecall_camera_close(void) {
    if (handle != CAMERA_HANDLE_INVALID) {
        camera_stop_viewfinder(handle);
        camera_close(handle);
        handle = CAMERA_HANDLE_INVALID;
    }
    free(latest);
    latest = NULL;
    ready = failure = 0;
}

int carecall_camera_open(int unit) {
    if (handle != CAMERA_HANDLE_INVALID) return EBUSY;
    latest = malloc(MAX_FRAME);
    if (!latest) return ENOMEM;
    int err = camera_open((camera_unit_t)unit, CAMERA_MODE_RO, &handle);
    if (err) { carecall_camera_close(); return err; }
    /* Keep the active sensor configuration; another preview may share it. */
    err = camera_start_viewfinder(handle, frame_ready, NULL, NULL);
    if (err) carecall_camera_close();
    return err;
}

/* Positive result is byte count; negative result is errno. Five-second timeout. */
int carecall_camera_read(unsigned char *dst, size_t capacity, uint32_t *info) {
    struct timespec until;
    clock_gettime(CLOCK_REALTIME, &until);
    until.tv_sec += 5;
    pthread_mutex_lock(&lock);
    int err = 0;
    while (!ready && !failure && !err)
        err = pthread_cond_timedwait(&changed, &lock, &until);
    if (failure) err = failure;
    if (!err && latest_size > capacity) err = EMSGSIZE;
    int result = -err;
    if (!err) {
        memcpy(dst, latest, latest_size);
        memcpy(info, details, sizeof(details));
        ready = 0;
        result = (int)latest_size;
    }
    pthread_mutex_unlock(&lock);
    return result;
}
