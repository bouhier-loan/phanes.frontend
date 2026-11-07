

define config.name = _("Phanes Layers")
define config.version = "1.0"
define build.name = "PhanesLayers"
define config.save_directory = "PhanesLayers-1700000000"

init python:
    build.archive("scripts", "all")
    build.classify("game/**.rpy", None)
    build.classify("game/**.rpyc", "scripts")
    build.classify("game/cache/**", None)
    build.classify("game/saves/**", None)
# Decompiled by unrpyc: https://github.com/CensoredUsername/unrpyc
