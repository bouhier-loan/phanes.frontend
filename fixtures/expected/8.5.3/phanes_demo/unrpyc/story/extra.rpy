

screen hud():
    frame:
        has vbox
        text "Affection: [affection]"
        textbutton "Secret" action Jump("secret_ending")

label secret_ending:
    e "You found the secret ending!"
    return

label unused_label:
    e "Nobody ever sees this."
    jump missing_label
return
# Decompiled by unrpyc: https://github.com/CensoredUsername/unrpyc
