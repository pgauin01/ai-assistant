# -*- mode: python ; coding: utf-8 -*-
import os
import faster_whisper
from PyInstaller.utils.hooks import copy_metadata

fw_assets = os.path.join(os.path.dirname(faster_whisper.__file__), 'assets')
# Adjust stealth_icon to point to your build folder relative to this spec file
stealth_icon =  os.path.join(SPECPATH, '..', 'build', 'icon.ico')

# 1. Define all folders and files to bundle
custom_datas = [
    (fw_assets, 'faster_whisper/assets'), 
    ('.env', '.'), 
    ('career_vector_db', 'career_vector_db'),
    ('career_data', 'career_data') # This folder must now be inside assistant-backend/
]

# 2. Add the metadata for moondream and soundcard
custom_datas += copy_metadata('moondream')
custom_datas += copy_metadata('soundcard')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=custom_datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    exclude_binaries=False,
    name='NVIDIA Container', 
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    icon=stealth_icon,
    console=False, # No terminal window for stealth
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)