import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCameraId } from "./cameraSource.ts";

test("Pi-hosted build always uses the Pi camera", () => {
  assert.equal(pickCameraId({ isDev: false, laptopWebcam: false, stored: "abc" }), "pi-usb");
  assert.equal(pickCameraId({ isDev: false, laptopWebcam: false, stored: null }), "pi-usb");
});

test("Vercel build uses the laptop webcam and ignores a stored Pi choice", () => {
  assert.equal(pickCameraId({ isDev: false, laptopWebcam: true, stored: null }), "local-webcam");
  assert.equal(pickCameraId({ isDev: false, laptopWebcam: true, stored: "pi-usb" }), "local-webcam");
  assert.equal(pickCameraId({ isDev: false, laptopWebcam: true, stored: "cam-42" }), "cam-42");
});

test("dev keeps the stored choice, including the Pi stream", () => {
  assert.equal(pickCameraId({ isDev: true, laptopWebcam: false, stored: null }), "local-webcam");
  assert.equal(pickCameraId({ isDev: true, laptopWebcam: false, stored: "pi-usb" }), "pi-usb");
});
