#!/usr/bin/env python3
"""LCD check: bright white backlight + "HELLO CARE CALL". Run: python3 test_lcd.py"""
import time

try:
    from smbus2 import SMBus
except ImportError:
    from smbus import SMBus

b = SMBus(1)
for reg, val in ((0, 0), (1, 0), (8, 0xAA), (4, 255), (3, 255), (2, 255)):
    b.write_byte_data(0x62, reg, val)  # backlight white
time.sleep(0.05)
for c in (0x28, 0x0C, 0x01, 0x06):
    b.write_byte_data(0x3E, 0x80, c)
    time.sleep(0.05)
for ch in "HELLO CARE CALL":
    b.write_byte_data(0x3E, 0x40, ord(ch))
print("sent: white backlight + HELLO CARE CALL. What does the LCD show?")
