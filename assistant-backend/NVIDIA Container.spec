import os
import faster_whisper
fw_assets = os.path.join(os.path.dirname(faster_whisper.__file__), 'assets')
# -*- mode: python ; coding: utf-8 -*-
stealth_icon = os.path.join(SPECPATH, '..', 'build', 'icon.ico')


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[(fw_assets, 'faster_whisper/assets')],
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
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    name='NVIDIA Container', 
    icon=stealth_icon,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
