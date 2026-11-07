

define e = Character("Eileen", image="eileen")

default persistent.glasses = False

layeredimage eileen:
    always:
        "eileen_base"

    group outfit:
        attribute casual default:
            "eileen_casual"
        attribute dress
        attribute hat

    group face auto:
        attribute happy default

    if persistent.glasses:
        "eileen_glasses"

layeredimage lucy far:
    attribute smile default

label start:
    show eileen
    e "Hello."
    show eileen dress
    e sad "Oh."
    show lucy far smile
    show eileen cape
    return
# Decompiled by unrpyc: https://github.com/CensoredUsername/unrpyc
