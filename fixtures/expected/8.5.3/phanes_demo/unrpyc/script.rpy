

image bg room = "images/bg room.png"
image eileen happy = "images/eileen happy.png"

default affection = 0
default met_lucy = False

label start:
    scene bg room
    show eileen happy
    "It was a quiet morning."
    e "Good morning! Did you sleep well?"
    extend " I hope so."
    p "I did, thanks."
    "Eileen" "A literal speaker name works too."
    $ affection += 1
    menu:
        "Where should we go?"
        "To the park":
            jump park
        "To the library" if affection > 0:
            call library
            jump finale
        "Stay home":
            e "Fine by me."
            jump finale

label park:
    play music "audio/theme.ogg"
    scene bg park
    show lucy smile
    l "Oh, hello there!"
    $ met_lucy = True
    s "Nice weather today."
    jump park.bench

label park.bench:
    "They sat on a bench."
    jump finale

label library:
    voice "audio/v1.ogg"
    m "Shh, this is a library."
    "Books everywhere."
    return

label finale:
    hide eileen
    if met_lucy:
        jump good_ending
    else:
        $ affection -= 1
    jump expression "bad" + "_ending"

label good_ending:
    centered "THE END"
    n "This part is told in NVL mode."
    nvl clear
    return

label bad_ending:
    "Nothing happened."
    "{b}The end{/b}, [player_name]."
    return
return
# Decompiled by unrpyc: https://github.com/CensoredUsername/unrpyc
