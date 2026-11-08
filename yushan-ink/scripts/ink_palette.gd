## 《千里江山图》风格化近似取色（非文物数字复原）。
## 结构：石青 / 石绿 / 赭石 / 绢本 / 泥金 / 青墨 / 人物与界面。
## 换风格时只需替换本文件，game.gd 不保留任何硬编码色值。
extends RefCounted

# 绢本与云雾留白
const SILK := Color("E8DCBE")
const SILK_LIGHT := Color("F2E9CF")
const MIST := Color("DCE5D8")
const WATER := Color("AFCBC6")
const GROUND := Color("5C886B")

# 石青（azurite）
const AZURITE_DEEP := Color("1F4E68")
const AZURITE := Color("2E6E8C")
const AZURITE_PALE := Color("76A6B8")

# 石绿（malachite）
const MALACHITE_DEEP := Color("2C5B4A")
const MALACHITE := Color("4E8B68")
const MALACHITE_PALE := Color("8FB88E")

# 赭石（ochre）
const OCHRE_DEEP := Color("8A5A38")
const OCHRE := Color("B0804C")
const OCHRE_PALE := Color("CBA875")

# 泥金
const GOLD := Color("D8B45C")
const GOLD_LIGHT := Color("F0D58A")

# 青墨勾线
const INK := Color("223A36")
const INK_SOFT := Color("40564C")
const ABYSS := Color("101C1A")

# 古建石材
const STONE := Color("B9A47C")
const STONE_LIGHT := Color("D6C08C")
const STONE_DARK := Color("8A7A5C")

# 人物
const ROBE := Color("E6DBC0")
const SKIN := Color("D8BE9A")

# shader 分级设色（随类赋彩：暗→石青，中→石绿，亮→绢黄，极亮→泥金）
const GRADE_DISTANT := Color("4C7E96")
const GRADE_SHADOW := Color("163A4E")
const GRADE_MID := Color("2F6E58")
const GRADE_LIGHT := Color("C9C39A")
const GRADE_GOLD := Color("E3BE6B")
const GRADE_SILK := Color("E8DCBE")
const GRADE_INK := Color("223A36")

# 界面
const UI_PANEL := Color("EDE2C6")
const UI_BORDER := Color("6B6247")
const UI_TEXT := Color("243A36")
const UI_SUBTEXT := Color("5A6B5B")
const UI_BUTTON := Color("37604F")
const UI_BUTTON_HOVER := Color("4F8068")
const UI_BUTTON_TEXT := Color("F5EEDB")
