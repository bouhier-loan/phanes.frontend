## Phanes fixture game: options and build configuration.

define config.name = _("Phanes Demo")
define config.version = "1.0"
define build.name = "PhanesDemo"
define config.save_directory = "PhanesDemo-1700000000"

init python:
    build.archive("scripts", "all")
    build.archive("images", "all")
    build.classify("game/**.rpy", None)
    build.classify("game/**.rpyc", "scripts")
    build.classify("game/images/**", "images")
    build.classify("game/cache/**", None)
    build.classify("game/saves/**", None)
