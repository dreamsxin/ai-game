extends Node3D

const INK_SHADER := """
shader_type canvas_item;

uniform float edge_strength : hint_range(0.0, 2.0) = 0.72;
uniform float grain_strength : hint_range(0.0, 0.12) = 0.025;
uniform float wash_strength : hint_range(0.0, 1.0) = 0.24;
uniform vec2 resolution = vec2(1440.0, 900.0);
uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear_mipmap;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
    vec2 px = 1.0 / resolution;
    vec4 center = texture(SCREEN_TEXTURE, SCREEN_UV);
    vec3 north = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(0.0, -px.y)).rgb;
    vec3 south = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(0.0, px.y)).rgb;
    vec3 east = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(px.x, 0.0)).rgb;
    vec3 west = texture(SCREEN_TEXTURE, SCREEN_UV + vec2(-px.x, 0.0)).rgb;
    float edge = length(north - south) + length(east - west);
    float ink = smoothstep(0.13, 0.56, edge) * edge_strength;
    float paper = (hash(floor(SCREEN_UV * resolution / 2.0)) - 0.5) * grain_strength;
    float fog_wash = smoothstep(0.12, 0.92, SCREEN_UV.y) * wash_strength;
    vec3 wash = vec3(0.62, 0.68, 0.63);
    vec3 color = mix(center.rgb, wash, fog_wash * 0.18);
    color = color / (vec3(1.0) + color * 0.42);
    color = mix(vec3(dot(color, vec3(0.333))), color, 0.32);
    color *= 0.9;
    color = mix(color, vec3(0.105, 0.125, 0.12), clamp(ink, 0.0, 0.74));
    color += paper;
    COLOR = vec4(color, center.a);
}
"""

const PLAYER_CONTROLLER := preload("res://scripts/player_controller.gd")
const ENEMY_CONTROLLER := preload("res://scripts/enemy_controller.gd")

const PHASE_INTRO := 0
const PHASE_EXPLORE := 1
const PHASE_COMBAT := 2
const PHASE_RETURN := 3
const PHASE_COMPLETE := 4
const PHASE_FAILED := 5

const STORY := [
    {"speaker": "旁白", "text": "迷路的第四天，水壶里只剩一口水。"},
    {"speaker": "墨小瑜 · 对讲机", "text": "龙灵玲，报坐标。你还有水吗？"},
    {"speaker": "龙灵玲", "text": "有。"},
    {"speaker": "墨小瑜 · 对讲机", "text": "骗人。"},
    {"speaker": "旁白", "text": "雾谷深处，一粒坠星停在她面前。"},
    {"speaker": "九形", "text": "你吞了我的小光。"},
    {"speaker": "九形", "text": "这里是玉山。想回家，只能上神殿。"},
    {"speaker": "九形", "text": "雾里有东西。看见黑线时，按住空格引流，再左键还回去。"},
    {"speaker": "旁白", "text": "引多少，身体就要承多少。鼻血是这次的代价。"},
    {"speaker": "龙灵玲", "text": "我不当神。我只想回家。"}
]

var world: Node3D
var camera: Camera3D
var player: PlayerController
var player_visual: Node3D
var hud: CanvasLayer
var overlay: ColorRect
var dialogue_panel: PanelContainer
var dialogue_label: Label
var speaker_label: Label
var continue_button: Button
var read_line_button: Button
var status_label: Label
var objective_label: Label
var ink_material: ShaderMaterial
var dialogue_index := -1
var input_locked := true
var has_shard := false
var enemy: EnemyController
var enemy_active := false
var charge := 0.0
var health := 100.0
var ink_meter := 0.0
var impact_flash := 0.0
var tutorial_finished := false
var phase := PHASE_INTRO
var camera_target := Vector3(0.0, 1.0, -4.0)

func _ready() -> void:
    _build_world()
    _build_hud()
    _show_dialogue(0)

func _process(delta: float) -> void:
    if input_locked:
        _update_shader(delta)
        return
    if phase == PHASE_FAILED or phase == PHASE_COMPLETE:
        _update_shader(delta)
        return
    player.move_from_input(delta)
    _update_camera(delta)
    _update_interaction()
    if enemy_active:
        enemy.tick(delta, player)
        if health <= 0.0:
            _set_phase(PHASE_FAILED)
    var focus_down := Input.is_action_pressed("focus")
    charge = move_toward(charge, 1.0 if focus_down else 0.0, delta * (0.9 if focus_down else 0.18))
    ink_meter = move_toward(ink_meter, 0.0, delta * 6.0)
    impact_flash = move_toward(impact_flash, 0.0, delta * 2.8)
    _update_shader(delta)
    _update_status()

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_R and phase in [PHASE_FAILED, PHASE_COMPLETE]:
        get_tree().reload_current_scene()
        return
    if input_locked:
        if event is InputEventKey and event.pressed and not event.echo and event.keycode in [KEY_SPACE, KEY_ENTER, KEY_E]:
            _advance_dialogue()
        elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
            _advance_dialogue()
        return
    if event.is_action_pressed("interact"):
        _interact()
    elif event.is_action_pressed("attack"):
        _attack()

func _build_world() -> void:
    world = Node3D.new()
    world.name = "OriginalInkLandscape"
    add_child(world)
    var environment := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_SKY
    var sky := Sky.new()
    var sky_mat := ProceduralSkyMaterial.new()
    sky_mat.sky_top_color = Color("7b8981")
    sky_mat.sky_horizon_color = Color("b2bbb1")
    sky_mat.ground_bottom_color = Color("3c4842")
    sky_mat.ground_horizon_color = Color("89958b")
    sky.sky_material = sky_mat
    env.sky = sky
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color("aab5a9")
    env.ambient_light_energy = 0.42
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    env.fog_enabled = true
    env.fog_light_color = Color("a5afa5")
    env.fog_density = 0.013
    env.fog_sky_affect = 0.82
    environment.environment = env
    world.add_child(environment)
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-48.0, -30.0, 0.0)
    sun.light_color = Color("e9e8d9")
    sun.light_energy = 0.52
    sun.shadow_enabled = true
    world.add_child(sun)
    _create_ground()
    _create_rocks_and_pines()
    _create_ruins()
    _create_star_shard()
    _create_enemy()
    _create_player()
    _create_camera()
    _create_ink_overlay()

func _create_ground() -> void:
    var ground := StaticBody3D.new()
    ground.name = "FogValleyFloor"
    var mesh := MeshInstance3D.new()
    var plane := PlaneMesh.new()
    plane.size = Vector2(80.0, 80.0)
    mesh.mesh = plane
    mesh.set_surface_override_material(0, _material(Color("78867e"), 0.92))
    ground.add_child(mesh)
    var collision := CollisionShape3D.new()
    var shape := BoxShape3D.new()
    shape.size = Vector3(80.0, 0.6, 80.0)
    collision.shape = shape
    collision.position.y = -0.3
    ground.add_child(collision)
    world.add_child(ground)
    for i in range(35):
        var x: float = -26.0 + float(i % 7) * 8.7
        var z: float = -30.0 - floor(float(i) / 7.0) * 8.0
        _create_mountain(Vector3(x, -2.0, z), Vector3(6.5 + float(i % 3), 8.0 + float((i * 7) % 9), 5.0 + float(i % 2)), Color("78837c" if i % 2 == 0 else "66736d"))
    for i in range(15):
        var x: float = -20.0 + float(i % 5) * 10.0
        var z: float = 31.0 + float(i / 5) * 10.0
        _create_mountain(Vector3(x, -1.0, z), Vector3(5.0, 7.0 + float(i % 4), 4.5), Color("69766e"))

func _create_mountain(pos: Vector3, size: Vector3, tint: Color) -> void:
    var rock := MeshInstance3D.new()
    var mesh := SphereMesh.new()
    mesh.radius = 1.0
    mesh.height = 2.0
    rock.mesh = mesh
    rock.scale = size
    rock.position = pos
    rock.rotation_degrees = Vector3(0.0, float(int(pos.x * 11.0) % 37), float(int(pos.z * 7.0) % 9) - 4.0)
    rock.set_surface_override_material(0, _material(tint, 1.0))
    world.add_child(rock)

func _create_rocks_and_pines() -> void:
    for i in range(48):
        var x: float = float((i * 17) % 49) - 24.0
        var z: float = float((i * 23) % 50) - 25.0
        if abs(x) < 4.5 and z > -5.0 and z < 14.0:
            continue
        if abs(x) < 9.0 and z > -27.0 and z < -7.0:
            continue
        if z < -4.0 and z > -27.0 and abs(x) < 17.0:
            continue
        var rock := MeshInstance3D.new()
        var rock_mesh := SphereMesh.new()
        rock_mesh.radius = 0.7
        rock_mesh.height = 1.1
        rock.mesh = rock_mesh
        rock.position = Vector3(x, 0.0, z)
        rock.scale = Vector3(0.8 + float(i % 4) * 0.25, 0.5 + float(i % 3) * 0.24, 0.6 + float(i % 2) * 0.3)
        rock.rotation_degrees = Vector3(0.0, float(i * 31), float(i % 5) * 3.0)
        rock.set_surface_override_material(0, _material(Color("7d8980" if i % 3 == 0 else "65716a"), 0.96))
        world.add_child(rock)
        if i % 3 == 0:
            _create_pine(Vector3(x + 1.4, 0.0, z - 1.2), 1.3 + float(i % 4) * 0.3)
    var forest_edges := [-24.0, -20.0, 20.0, 24.0]
    for row in range(2):
        for edge_x in forest_edges:
            var z: float = -26.0 - float(row) * 9.0
            _create_pine(Vector3(edge_x + float(row % 2) * 1.0, 0.0, z), 0.9 + float((row + int(edge_x)) % 3) * 0.16)

func _create_pine(pos: Vector3, size: float) -> void:
    var trunk := MeshInstance3D.new()
    var trunk_mesh := CylinderMesh.new()
    trunk_mesh.top_radius = 0.08 * size
    trunk_mesh.bottom_radius = 0.17 * size
    trunk_mesh.height = 2.4 * size
    trunk.mesh = trunk_mesh
    trunk.position = pos + Vector3(0.0, trunk_mesh.height * 0.5, 0.0)
    trunk.set_surface_override_material(0, _material(Color("535c56"), 1.0))
    world.add_child(trunk)
    var crown_radii := [0.9, 0.69, 0.47]
    var crown_heights := [1.8, 1.7, 1.55]
    var crown_centers := [1.65, 2.55, 3.35]
    for tier in range(3):
        var crown := MeshInstance3D.new()
        var canopy := CylinderMesh.new()
        canopy.top_radius = 0.025 * size
        canopy.bottom_radius = crown_radii[tier] * size
        canopy.height = crown_heights[tier] * size
        crown.mesh = canopy
        crown.position = pos + Vector3(float(tier % 2) * 0.08 * size, crown_centers[tier] * size, float(tier % 2) * 0.08 * size)
        crown.rotation_degrees = Vector3(0.0, float(tier * 31), -2.0 + float(tier) * 1.5)
        crown.set_surface_override_material(0, _material(Color("455850" if tier % 2 == 0 else "53655a"), 1.0))
        world.add_child(crown)

func _create_ruins() -> void:
    world.add_child(_box("RuinFoundation", Vector3(8.0, 0.6, 7.0), Vector3(0.0, 0.2, -12.5), Color("686f67")))
    for x in [-3.3, -1.1, 1.1, 3.3]:
        for z in [-14.5, -10.2]:
            if z > -11.0:
                continue
            var pillar := _box("BrokenStonePillar", Vector3(0.68, 4.2, 0.68), Vector3(x, 2.4, z), Color("858b7d"))
            pillar.rotation_degrees.z = float(int(x * 4.0) % 5) * 1.5
            world.add_child(pillar)
            world.add_child(_box("PillarCap", Vector3(1.0, 0.36, 1.0), Vector3(x, 4.5, z), Color("9ba092")))
    for i in range(5):
        var step := _box("WeatheredStair", Vector3(3.6 + float(i) * 0.7, 0.3, 1.1), Vector3(0.0, 0.26 + float(i) * 0.28, -20.0 - float(i) * 1.0), Color("a6aa9b"))
        world.add_child(step)
    world.add_child(_box("AncientLintel", Vector3(5.4, 0.44, 0.65), Vector3(0.0, 4.8, -12.0), Color("96998b")))
    for i in range(7):
        var line := MeshInstance3D.new()
        var torus := TorusMesh.new()
        torus.inner_radius = 0.035
        torus.outer_radius = 0.055
        line.mesh = torus
        line.position = Vector3(-2.7 + float(i) * 0.9, 0.09, -12.0)
        line.rotation_degrees.x = 90.0
        line.set_surface_override_material(0, _material(Color("303934"), 0.85))
        world.add_child(line)
    _create_pine(Vector3(-8.8, 0.0, -12.5), 0.78)
    _create_pine(Vector3(8.8, 0.0, -12.5), 0.78)

func _create_star_shard() -> void:
    var shard := Node3D.new()
    shard.name = "FallenStar"
    shard.position = Vector3(0.0, 0.68, -10.8)
    var gem := MeshInstance3D.new()
    var mesh := SphereMesh.new()
    mesh.radius = 0.58
    mesh.height = 1.2
    gem.mesh = mesh
    gem.scale = Vector3(0.72, 1.25, 0.76)
    gem.rotation_degrees = Vector3(18.0, 0.0, 23.0)
    var mat := _material(Color("e6d5a4"), 0.3)
    mat.emission_enabled = true
    mat.emission = Color("f4cf78")
    mat.emission_energy_multiplier = 2.1
    gem.set_surface_override_material(0, mat)
    shard.add_child(gem)
    var glow := OmniLight3D.new()
    glow.light_color = Color("efce82")
    glow.light_energy = 1.8
    glow.omni_range = 7.0
    glow.position.y = 1.1
    shard.add_child(glow)
    var halo := MeshInstance3D.new()
    var torus := TorusMesh.new()
    torus.inner_radius = 0.66
    torus.outer_radius = 0.71
    halo.mesh = torus
    halo.rotation_degrees.x = 90.0
    halo.position.y = 0.08
    halo.set_surface_override_material(0, _material(Color("ded3b2"), 0.42))
    shard.add_child(halo)
    world.add_child(shard)

func _create_enemy() -> void:
    enemy = ENEMY_CONTROLLER.new() as EnemyController
    enemy.name = "HollowEater"
    enemy.player_hit.connect(_on_enemy_player_hit)
    enemy.defeated.connect(_on_enemy_defeated)
    enemy.position = Vector3(0.0, 0.15, -5.8)
    var torso := MeshInstance3D.new()
    var body := SphereMesh.new()
    body.radius = 0.74
    body.height = 1.65
    torso.mesh = body
    torso.scale = Vector3(0.9, 1.1, 0.86)
    torso.position.y = 0.9
    torso.set_surface_override_material(0, _material(Color("525c57"), 0.8))
    enemy.add_child(torso)
    for i in range(4):
        var limb := MeshInstance3D.new()
        var segment := CylinderMesh.new()
        segment.top_radius = 0.11
        segment.bottom_radius = 0.17
        segment.height = 1.65
        limb.mesh = segment
        var side := -1.0 if i % 2 == 0 else 1.0
        var forward := -1.0 if i < 2 else 1.0
        limb.position = Vector3(side * 0.47, 0.55, forward * 0.38)
        limb.rotation_degrees = Vector3(0.0, 0.0, side * 52.0)
        limb.set_surface_override_material(0, _material(Color("434c48"), 0.7))
        enemy.add_child(limb)
    var face := MeshInstance3D.new()
    var slit := SphereMesh.new()
    slit.radius = 0.24
    slit.height = 0.16
    face.mesh = slit
    face.scale = Vector3(1.4, 0.48, 0.3)
    face.position = Vector3(0.0, 1.08, -0.68)
    var face_mat := _material(Color("1d2521"), 0.38)
    face_mat.emission_enabled = true
    face_mat.emission = Color("1e2721")
    face.set_surface_override_material(0, face_mat)
    enemy.add_child(face)
    var aura := OmniLight3D.new()
    aura.name = "ThreatPulse"
    aura.light_color = Color("858e80")
    aura.light_energy = 0.0
    aura.omni_range = 3.8
    aura.position.y = 0.6
    enemy.add_child(aura)
    enemy.visible = false
    world.add_child(enemy)

func _create_player() -> void:
    player = PLAYER_CONTROLLER.new() as Node3D
    player.name = "LongLingling"
    player.position = Vector3(0.0, 0.05, 3.8)
    player_visual = Node3D.new()
    player.add_child(player_visual)
    player.bind_visual(player_visual)
    player_visual.add_child(_capsule("TravelCoat", Vector3(0.0, 0.9, 0.0), Vector3(0.62, 1.05, 0.48), Color("444f4b")))
    player_visual.add_child(_capsule("Head", Vector3(0.0, 2.03, -0.02), Vector3(0.28, 0.32, 0.28), Color("c1b6a0")))
    for side in [-1.0, 1.0]:
        player_visual.add_child(_box("Trousers", Vector3(0.18, 0.62, 0.2), Vector3(side * 0.18, 0.31, 0.0), Color("343e3a")))
    player_visual.add_child(_box("FieldPack", Vector3(0.62, 0.82, 0.35), Vector3(0.0, 1.0, 0.36), Color("7b735e")))
    var blade := _box("WrappedBlade", Vector3(0.09, 1.12, 0.12), Vector3(0.55, 0.7, 0.1), Color("a9a58e"))
    blade.rotation_degrees.z = -22.0
    player_visual.add_child(blade)
    world.add_child(player)

func _create_camera() -> void:
    camera = Camera3D.new()
    camera.name = "FixedThreeQuarterCamera"
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL
    camera.size = 24.5
    camera.position = Vector3(0.0, 13.0, 11.0)
    world.add_child(camera)
    camera.look_at(camera_target, Vector3.UP)
    camera.current = true

func _create_ink_overlay() -> void:
    var layer := CanvasLayer.new()
    layer.layer = 2
    add_child(layer)
    overlay = ColorRect.new()
    overlay.name = "InkWashPostProcess"
    overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
    ink_material = ShaderMaterial.new()
    var shader := Shader.new()
    shader.code = INK_SHADER
    ink_material.shader = shader
    overlay.material = ink_material
    layer.add_child(overlay)

func _build_hud() -> void:
    hud = CanvasLayer.new()
    hud.layer = 3
    add_child(hud)
    var margin := MarginContainer.new()
    margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    margin.add_theme_constant_override("margin_left", 36)
    margin.add_theme_constant_override("margin_right", 36)
    margin.add_theme_constant_override("margin_top", 26)
    margin.add_theme_constant_override("margin_bottom", 25)
    hud.add_child(margin)
    var root := VBoxContainer.new()
    root.add_theme_constant_override("separation", 12)
    margin.add_child(root)
    var top := HBoxContainer.new()
    root.add_child(top)
    var title := Label.new()
    title.text = "玉山 · 雾中坠星"
    title.add_theme_font_size_override("font_size", 20)
    title.add_theme_color_override("font_color", Color("26302b"))
    top.add_child(title)
    var spacer := Control.new()
    spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    top.add_child(spacer)
    status_label = Label.new()
    status_label.text = "凡胎    水：一口"
    status_label.add_theme_font_size_override("font_size", 16)
    status_label.add_theme_color_override("font_color", Color("26302b"))
    top.add_child(status_label)
    objective_label = Label.new()
    objective_label.text = "主线  ·  找到坠星"
    objective_label.add_theme_font_size_override("font_size", 15)
    objective_label.add_theme_color_override("font_color", Color("37423b"))
    root.add_child(objective_label)
    var bottom_spacer := Control.new()
    bottom_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
    root.add_child(bottom_spacer)
    var controls := Label.new()
    controls.text = "WASD 移动   ·   E 互动   ·   空格读线   ·   鼠标左键出刀"
    controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    controls.add_theme_font_size_override("font_size", 15)
    controls.add_theme_color_override("font_color", Color("303a34"))
    root.add_child(controls)
    var panel_style := StyleBoxFlat.new()
    panel_style.bg_color = Color(0.84, 0.87, 0.82, 0.96)
    panel_style.border_color = Color("35433a")
    panel_style.set_border_width_all(1)
    panel_style.set_corner_radius_all(4)
    panel_style.content_margin_left = 22.0
    panel_style.content_margin_right = 22.0
    panel_style.content_margin_top = 16.0
    panel_style.content_margin_bottom = 15.0
    dialogue_panel = PanelContainer.new()
    dialogue_panel.add_theme_stylebox_override("panel", panel_style)
    dialogue_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
    dialogue_panel.offset_left = 100.0
    dialogue_panel.offset_right = -100.0
    dialogue_panel.offset_top = -180.0
    dialogue_panel.offset_bottom = -30.0
    hud.add_child(dialogue_panel)
    var dialogue_column := VBoxContainer.new()
    dialogue_column.add_theme_constant_override("separation", 10)
    dialogue_panel.add_child(dialogue_column)
    speaker_label = Label.new()
    speaker_label.add_theme_font_size_override("font_size", 16)
    speaker_label.add_theme_color_override("font_color", Color("5f6b5e"))
    dialogue_column.add_child(speaker_label)
    dialogue_label = Label.new()
    dialogue_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    dialogue_label.add_theme_font_size_override("font_size", 21)
    dialogue_label.add_theme_color_override("font_color", Color("26302b"))
    dialogue_column.add_child(dialogue_label)
    var button_row := HBoxContainer.new()
    button_row.alignment = BoxContainer.ALIGNMENT_END
    dialogue_column.add_child(button_row)
    continue_button = Button.new()
    continue_button.text = "继续  [空格]"
    continue_button.pressed.connect(_advance_dialogue)
    button_row.add_child(continue_button)
    read_line_button = Button.new()
    read_line_button.text = "读线  [按住空格]"
    read_line_button.visible = false
    read_line_button.disabled = true
    read_line_button.pressed.connect(_finish_tutorial)
    button_row.add_child(read_line_button)
    _style_button(continue_button)
    _style_button(read_line_button)
    dialogue_panel.visible = true

func _style_button(button: Button) -> void:
    var style := StyleBoxFlat.new()
    style.bg_color = Color("47564c")
    style.set_corner_radius_all(3)
    style.content_margin_left = 14.0
    style.content_margin_right = 14.0
    style.content_margin_top = 7.0
    style.content_margin_bottom = 7.0
    button.add_theme_stylebox_override("normal", style)
    var hover := style.duplicate() as StyleBoxFlat
    hover.bg_color = Color("657663")
    button.add_theme_stylebox_override("hover", hover)
    button.add_theme_color_override("font_color", Color("f0eee3"))
    button.add_theme_color_override("font_hover_color", Color.WHITE)
    button.add_theme_font_size_override("font_size", 15)

func _show_dialogue(index: int) -> void:
    dialogue_index = index
    if index >= STORY.size():
        dialogue_panel.visible = false
        input_locked = false
        _begin_play()
        return
    if index == 5 and not has_shard:
        dialogue_panel.visible = false
        input_locked = false
        _set_phase(PHASE_EXPLORE)
        return
    var line: Dictionary = STORY[index]
    speaker_label.text = str(line["speaker"])
    dialogue_label.text = str(line["text"])
    var is_instruction := index == 7
    continue_button.visible = not is_instruction
    read_line_button.visible = is_instruction
    dialogue_panel.visible = true
    input_locked = true

func _advance_dialogue() -> void:
    if not input_locked or dialogue_index == 7:
        return
    _show_dialogue(dialogue_index + 1)

func _finish_tutorial() -> void:
    if tutorial_finished:
        return
    tutorial_finished = true
    _show_dialogue(8)

func _begin_play() -> void:
    if phase == PHASE_INTRO:
        _set_phase(PHASE_EXPLORE)
    elif has_shard and not tutorial_finished:
        _set_phase(PHASE_EXPLORE)
    elif has_shard:
        enemy.visible = true
        enemy.active = true
        enemy_active = true
        _set_phase(PHASE_COMBAT)
    _update_status()

func _set_phase(next_phase: int) -> void:
    phase = next_phase
    match phase:
        PHASE_EXPLORE:
            objective_label.text = "主线  ·  走近坠星（E）"
        PHASE_COMBAT:
            objective_label.text = "战斗  ·  读线蓄力，再靠近出刀"
        PHASE_RETURN:
            objective_label.text = "主线  ·  登上神殿平台"
        PHASE_COMPLETE:
            input_locked = true
            dialogue_panel.visible = true
            speaker_label.text = "玉山"
            dialogue_label.text = "雾散了。回家的路，终于有了方向。\n按 R 重新开始。"
            continue_button.visible = false
            read_line_button.visible = false
            objective_label.text = "序章完成  ·  玉山神殿"
        PHASE_FAILED:
            input_locked = true
            dialogue_panel.visible = true
            speaker_label.text = "意识模糊"
            dialogue_label.text = "负荷已经越过极限。\n按 R 重新开始。"
            continue_button.visible = false
            read_line_button.visible = false
            objective_label.text = "任务失败  ·  按 R 重试"
    _update_status()

func _on_enemy_player_hit(damage: float) -> void:
    health = maxf(0.0, health - damage)
    impact_flash = maxf(impact_flash, 0.16)

func _on_enemy_defeated() -> void:
    enemy_active = false
    enemy.queue_free()
    health = minf(100.0, health + 18.0)
    _set_phase(PHASE_RETURN)

func _update_status() -> void:
    if status_label == null:
        return
    var state := "星核已入体" if has_shard else "水：一口"
    if health < 100.0:
        state += "    负荷：%.0f%%" % (100.0 - health)
    status_label.text = ("潜渊" if has_shard else "凡胎") + "    " + state

func _update_camera(delta: float) -> void:
    var desired := player.position + Vector3(0.0, 0.0, -6.0)
    camera_target = camera_target.lerp(desired, delta * 1.2)
    var camera_offset := Vector3(0.0, 12.0, 15.0)
    camera.position = camera.position.lerp(camera_target + camera_offset, delta * 0.9)
    camera.look_at(camera_target, Vector3.UP)

func _update_interaction() -> void:
    if phase == PHASE_EXPLORE:
        if player.position.distance_to(Vector3(0.0, 0.0, -10.8)) < 2.7:
            objective_label.text = "坠星在眼前  ·  按 E 触碰"
    elif phase == PHASE_COMBAT:
        objective_label.text = "战斗  ·  读线蓄力，再靠近出刀"
    elif phase == PHASE_RETURN:
        objective_label.text = "主线  ·  登上神殿平台"

func _interact() -> void:
    if phase == PHASE_EXPLORE and player.position.distance_to(Vector3(0.0, 0.0, -10.8)) < 3.1:
        has_shard = true
        _absorb_shard()
        _show_dialogue(5)
    elif phase == PHASE_RETURN and player.position.distance_to(Vector3(0.0, 0.0, -12.5)) < 5.0:
        _set_phase(PHASE_COMPLETE)

func _absorb_shard() -> void:
    ink_meter = 100.0
    impact_flash = 0.85
    health = 76.0
    player_visual.scale = Vector3(1.0, 1.06, 1.0)

func _attack() -> void:
    if phase != PHASE_COMBAT or not enemy_active:
        return
    if player.position.distance_to(enemy.position) <= 5.4:
        if charge < 0.45:
            objective_label.text = "先按住空格读线，再出刀。"
            return
        enemy.receive_hit()
        charge = 0.0
        ink_meter = 95.0
        impact_flash = 0.55
        enemy.scale = Vector3(0.82, 0.82, 0.82)
        var tween := create_tween()
        tween.tween_property(enemy, "scale", Vector3.ONE, 0.18)
    else:
        objective_label.text = "再靠近些，刀才能还回那股力。"

func _update_shader(_delta: float) -> void:
    if ink_material != null:
        ink_material.set_shader_parameter("edge_strength", 0.72 + charge * 0.7 + impact_flash * 0.8)
        ink_material.set_shader_parameter("wash_strength", 0.24 + ink_meter / 100.0 * 0.3)
        ink_material.set_shader_parameter("grain_strength", 0.018 + impact_flash * 0.045)
        ink_material.set_shader_parameter("resolution", Vector2(get_viewport().get_visible_rect().size))

func _material(color: Color, roughness: float = 0.88) -> StandardMaterial3D:
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = roughness
    return material

func _box(node_name: String, size: Vector3, pos: Vector3, tint: Color) -> MeshInstance3D:
    var instance := MeshInstance3D.new()
    instance.name = node_name
    var mesh := BoxMesh.new()
    mesh.size = size
    instance.mesh = mesh
    instance.position = pos
    instance.set_surface_override_material(0, _material(tint))
    return instance

func _capsule(node_name: String, pos: Vector3, dimensions: Vector3, tint: Color) -> MeshInstance3D:
    var instance := MeshInstance3D.new()
    instance.name = node_name
    var mesh := CapsuleMesh.new()
    mesh.radius = 0.34
    mesh.height = 1.4
    instance.mesh = mesh
    instance.scale = dimensions
    instance.position = pos
    instance.set_surface_override_material(0, _material(tint))
    return instance
