# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import copy_metadata

# 1. Start with your Vector DB folder (so your Career Agent doesn't break!)
custom_datas = [
    ('career_vector_db', 'career_vector_db')
]

# 2. Append the metadata for our finicky libraries
custom_datas += copy_metadata('moondream')
custom_datas += copy_metadata('soundcard') # Good to add this now for the wiretap!

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=custom_datas, # <-- Point PyInstaller to our custom array
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
    [],
    exclude_binaries=True,
    name='NVIDIA Container',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='NVIDIA Container',
)
