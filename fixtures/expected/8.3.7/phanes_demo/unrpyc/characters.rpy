

define e = Character("Eileen", color="#c8ffc8")
define l = Character(_("Lucy"), image="lucy")
define n = Character(None, kind=nvl)
define p = DynamicCharacter("player_name")
define m = Character("[player_name]", color="#ffcccc")

default player_name = "Alex"

init python:
    s = Character('Sylvie', what_color="#ccccff")
# Decompiled by unrpyc: https://github.com/CensoredUsername/unrpyc
