# Contract change requests (append one line, never edit others' lines)

Format: `YYYY-MM-DD HH:MM | name | what you need changed | why`
2026-10-17 19:05 | rey | Trigger min confidence 0.8 feels too strict with real hands in testing; propose 0.7 and a time-based 1 s hold with gentle drain instead of 12 consecutive frames | detection now runs at 30 fps so 12 frames is only 0.4 s, and one odd frame should not wipe the ring
