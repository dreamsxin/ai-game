extends Node3D

## 青绿设色后处理：勾线填彩 + 绢本暖底 + 泥金勾轮廓。
## 分级色由 InkPalette 通过 uniform 注入，读线蓄力驱动青金辉光。
const QINGLU_SHADER := """
shader_type canvas_item;

uniform float edge_strength : hint_range(0.0, 2.0) = 0.72;
uniform float grain_strength : hint_range(0.0, 0.12) = 0.025;
uniform float wash_strength : hint_range(0.0, 1.0) = 0.24;
uniform float grade_strength : hint_range(0.0, 1.0) = 0.42;
uniform float gold_strength : hint_range(0.0, 1.0) = 0.30;
uniform float charge : hint_range(0.0, 1.0) = 0.0;
uniform float impact : hint_range(0.0, 1.0) = 0.0;
uniform vec2 resolution = vec2(1440.0, 900.0);
uniform vec3 shadow_tint = vec3(0.086, 0.227, 0.306);
uniform vec3 mid_tint = vec3(0.184, 0.431, 0.345);
uniform vec3 light_tint = vec3(0.788, 0.765, 0.604);
uniform vec3 gold_tint = vec3(0.890, 0.745, 0.420);
uniform vec3 silk_tint = vec3(0.910, 0.863, 0.745);
uniform vec3 ink_tint = vec3(0.133, 0.227, 0.212);
uniform vec3 distance_tint_color = vec3(0.298, 0.494, 0.588);
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
    float gold_edge = smoothstep(0.46, 0.92, edge) * gold_strength;

    // 随类赋彩：按明度把画面映射到 石青 -> 石绿 -> 绢黄 -> 泥金
    vec3 src = center.rgb;
    float luma = dot(src, vec3(0.299, 0.587, 0.114));
    vec3 graded = mix(shadow_tint, mid_tint, smoothstep(0.06, 0.42, luma));
    graded = mix(graded, light_tint, smoothstep(0.42, 0.86, luma));
    graded = mix(graded, gold_tint, smoothstep(0.86, 1.05, luma) * 0.55);
    vec3 color = mix(src, graded, grade_strength);
    color = color / (vec3(1.0) + color * 0.30);

    // 绢本暖底（只作薄罩，不盖掉石青石绿）
    color = mix(color, silk_tint, 0.06 + wash_strength * 0.03);

    // 云雾留白
    float fog_wash = smoothstep(0.08, 0.94, SCREEN_UV.y) * wash_strength;
    color = mix(color, vec3(0.82, 0.87, 0.82), fog_wash * 0.16);

    // 近绿远青：画面上部自然渐染淡石青，无硬边
    float distant = (1.0 - smoothstep(0.02, 0.55, SCREEN_UV.y)) * 0.28;
    color = mix(color, distance_tint_color, distant);

    // 随类赋彩：高饱和暖色（泥金坠星、赭石古建）保留金调，不被灰化
    float warmth = clamp((src.r - src.b) * 1.6, 0.0, 1.0);
    color = mix(color, gold_tint, warmth * 0.35);

    // 青墨勾线，再以泥金提亮山脊轮廓
    color = mix(color, ink_tint, clamp(ink, 0.0, 0.78));
    color = mix(color, gold_tint, clamp(gold_edge * (0.35 + charge * 0.65), 0.0, 0.55));

    // 读线蓄力与冲击的青金辉光
    float focus = charge * (0.55 + 0.45 * sin(SCREEN_UV.y * 16.0));
    color += gold_tint * focus * 0.055;
    color += mid_tint * impact * 0.05;

    // 绢纹经纬 + 纸面颗粒
    float weave = sin(SCREEN_UV.x * resolution.x * 1.5) * sin(SCREEN_UV.y * resolution.y * 1.5);
    float paper = (hash(floor(SCREEN_UV * resolution / 2.0)) - 0.5) * grain_strength;
    color += paper + weave * 0.006;
    color *= 0.92;

    COLOR = vec4(clamp(color, 0.0, 1.0), center.a);
}
"""

const PALETTE := preload("res://scripts/ink_palette.gd")
const PLAYER_CONTROLLER := preload("res://scripts/player_controller.gd")
const ENEMY_CONTROLLER := preload("res://scripts/enemy_controller.gd")
const AUDIO_SYNTH := preload("res://scripts/audio_synth.gd")

const PHASE_INTRO := 0
const PHASE_EXPLORE := 1
const PHASE_COMBAT := 2
const PHASE_RETURN := 3
const PHASE_COMPLETE := 4
const PHASE_FAILED := 5
const TUTORIAL_LINE := 7

const STORY := [
    {"speaker": "旁白", "text": "迷路的第四天，水壶里只剩一口水。"},
    {"speaker": "墨小瑜 · 对讲机", "text": "龙灵玲，报坐标。你还有水吗？"},
    {"speaker": "龙灵玲", "text": "有。"},
    {"speaker": "墨小瑜 · 对讲机", "text": "骗人。"},
    {"speaker": "旁白", "text": "青绿的山一层层向雾里退开，一粒坠星停在她面前。"},
    {"speaker": "九形", "text": "你吞了我的小光。"},
    {"speaker": "九形", "text": "这里是玉山。想回家，只能上神殿。"},
    {"speaker": "九形", "text": "雾里有东西。看见金线时，按住空格引流，再左键还回去。"},
    {"speaker": "旁白", "text": "引多少，身体就要承多少。鼻血是这次的代价。"},
    {"speaker": "龙灵玲", "text": "我不当神。我只想回家。"}
]

var world: Node3D
var camera: Camera3D
var player: PlayerController
var player_visual: Node3D
var charge_ring: MeshInstance3D
var charge_ring_mat: StandardMaterial3D
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
var audio: Node
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
    _build_audio()
    _build_world()
    _build_hud()
    _show_dialogue(0)

func _process(delta: float) -> void:
    if input_locked:
        _update_shader()
        return
    if phase == PHASE_FAILED or phase == PHASE_COMPLETE:
        _update_shader()
        return
    player.move_from_input(delta)
    _update_camera(delta)
    _update_interaction()
    if enemy_active:
        enemy.tick(delta, player)
    var focus_down := Input.is_action_pressed("focus") and phase == PHASE_COMBAT
    charge = move_toward(charge, 1.0 if focus_down else 0.0, delta * (0.9 if focus_down else 0.18))
    if focus_down:
        health = maxf(0.0, health - delta * 2.2)
        ink_meter = minf(100.0, ink_meter + delta * 32.0)
    ink_meter = move_toward(ink_meter, 0.0, delta * 6.0)
    impact_flash = move_toward(impact_flash, 0.0, delta * 2.8)
    _update_charge_ring()
    if health <= 0.0:
        _set_phase(PHASE_FAILED)
    _update_shader()
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

func _build_audio() -> void:
    audio = AUDIO_SYNTH.new()
    audio.name = "InkAudio"
    add_child(audio)

func _play_sound(kind: String) -> void:
    if audio != null:
        audio.call("play", kind)

func _build_world() -> void:
    world = Node3D.new()
    world.name = "QingluLandscape"
    add_child(world)
    var environment := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_SKY
    var sky := Sky.new()
    var sky_mat := ProceduralSkyMaterial.new()
    sky_mat.sky_top_color = PALETTE.AZURITE
    sky_mat.sky_horizon_color = PALETTE.MIST
    sky_mat.ground_bottom_color = PALETTE.MALACHITE_DEEP
    sky_mat.ground_horizon_color = PALETTE.MALACHITE_PALE
    sky.sky_material = sky_mat
    env.sky = sky
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = PALETTE.MIST
    env.ambient_light_energy = 0.38
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    env.tonemap_exposure = 0.92
    env.fog_enabled = true
    env.fog_light_color = PALETTE.AZURITE_PALE
    env.fog_density = 0.011
    env.fog_sky_affect = 0.62
    environment.environment = env
    world.add_child(environment)
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-48.0, -30.0, 0.0)
    sun.light_color = PALETTE.GOLD_LIGHT
    sun.light_energy = 0.58
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
    mesh.set_surface_override_material(0, _material(PALETTE.GROUND, 0.92))
    ground.add_child(mesh)
    var collision := CollisionShape3D.new()
    var shape := BoxShape3D.new()
    shape.size = Vector3(80.0, 0.6, 80.0)
    collision.shape = shape
    collision.position.y = -0.3
    ground.add_child(collision)
    world.add_child(ground)

    # 淡青江水：横向留白，远山山脚落在水面上
    var river := MeshInstance3D.new()
    var river_plane := PlaneMesh.new()
    river_plane.size = Vector2(80.0, 22.0)
    river.mesh = river_plane
    river.position = Vector3(0.0, 0.04, -35.0)
    var river_mat := _material(PALETTE.WATER, 0.25)
    river_mat.albedo_color.a = 0.58
    river_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    river.set_surface_override_material(0, river_mat)
    world.add_child(river)

    # 层峦叠嶂：近石绿、中石青、远浅石青
    var layers := [PALETTE.MALACHITE, PALETTE.AZURITE, PALETTE.AZURITE_PALE]
    for i in range(35):
        var x: float = -26.0 + float(i % 7) * 8.7
        var z: float = -30.0 - floor(float(i) / 7.0) * 8.0
        var layer: int = int(floor(float(i) / 7.0)) % 3
        var height: float = 5.0 + float((i * 7) % 7)
        _create_mountain(Vector3(x, -2.0, z), Vector3(6.5 + float(i % 3), height, 5.0 + float(i % 2)), layers[layer])
    for i in range(15):
        var x: float = -20.0 + float(i % 5) * 10.0
        var z: float = 31.0 + float(i / 5) * 10.0
        _create_mountain(Vector3(x, -1.0, z), Vector3(5.0, 5.0 + float(i % 4), 4.5), PALETTE.MALACHITE_DEEP)

func _create_mountain(pos: Vector3, size: Vector3, tint: Color) -> void:
    # 赭石山脚 / 坡岸
    var foot := MeshInstance3D.new()
    var foot_mesh := SphereMesh.new()
    foot_mesh.radius = 1.0
    foot_mesh.height = 1.4
    foot.mesh = foot_mesh
    foot.scale = Vector3(size.x * 1.05, 1.5, size.z * 1.05)
    foot.position = Vector3(pos.x, 0.15, pos.z)
    foot.set_surface_override_material(0, _material(PALETTE.OCHRE, 1.0))
    world.add_child(foot)
    # 主峰与错落副峰，六边锥体形成青绿叠嶂
    var peaks := [
        {"offset": Vector3.ZERO, "scale": 1.0, "color": tint},
        {"offset": Vector3(-size.x * 0.62, 0.0, size.z * 0.25), "scale": 0.66, "color": PALETTE.MALACHITE_DEEP},
        {"offset": Vector3(size.x * 0.58, 0.0, -size.z * 0.22), "scale": 0.74, "color": PALETTE.AZURITE_DEEP}
    ]
    for peak in peaks:
        var peak_scale: float = peak["scale"]
        var offset: Vector3 = peak["offset"]
        var cone := MeshInstance3D.new()
        var cone_mesh := CylinderMesh.new()
        cone_mesh.top_radius = 0.0
        cone_mesh.bottom_radius = 1.0
        cone_mesh.height = 2.0
        cone_mesh.radial_segments = 6
        cone.mesh = cone_mesh
        cone.scale = Vector3(size.x * peak_scale, size.y * peak_scale, size.z * peak_scale)
        cone.position = pos + Vector3(offset.x, size.y * peak_scale * 0.92, offset.z)
        cone.rotation_degrees.y = float(int(pos.x * 11.0) % 37)
        cone.set_surface_override_material(0, _material(peak["color"], 1.0))
        world.add_child(cone)

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
        rock.set_surface_override_material(0, _material(PALETTE.MALACHITE_DEEP if i % 3 == 0 else PALETTE.STONE_DARK, 0.96))
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
    trunk.set_surface_override_material(0, _material(PALETTE.OCHRE_DEEP, 1.0))
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
        crown.set_surface_override_material(0, _material(PALETTE.MALACHITE_DEEP if tier % 2 == 0 else PALETTE.MALACHITE, 1.0))
        world.add_child(crown)

func _create_ruins() -> void:
    world.add_child(_box("RuinFoundation", Vector3(8.0, 0.6, 7.0), Vector3(0.0, 0.2, -12.5), PALETTE.STONE_DARK))
    for x in [-3.3, -1.1, 1.1, 3.3]:
        for z in [-14.5, -10.2]:
            if z > -11.0:
                continue
            var pillar := _box("BrokenStonePillar", Vector3(0.68, 4.2, 0.68), Vector3(x, 2.4, z), PALETTE.STONE)
            pillar.rotation_degrees.z = float(int(x * 4.0) % 5) * 1.5
            world.add_child(pillar)
            world.add_child(_box("PillarCap", Vector3(1.0, 0.36, 1.0), Vector3(x, 4.5, z), PALETTE.STONE_LIGHT))
    for i in range(5):
        world.add_child(_box("WeatheredStair", Vector3(3.6 + float(i) * 0.7, 0.3, 1.1), Vector3(0.0, 0.26 + float(i) * 0.28, -20.0 - float(i) * 1.0), PALETTE.STONE_LIGHT))
    world.add_child(_box("AncientLintel", Vector3(5.4, 0.44, 0.65), Vector3(0.0, 4.8, -12.0), PALETTE.OCHRE_PALE))
    world.add_child(_box("GildedLintelInlay", Vector3(5.0, 0.06, 0.08), Vector3(0.0, 5.06, -11.70), PALETTE.GOLD))
    for i in range(7):
        var line := MeshInstance3D.new()
        var torus := TorusMesh.new()
        torus.inner_radius = 0.035
        torus.outer_radius = 0.055
        line.mesh = torus
        line.position = Vector3(-2.7 + float(i) * 0.9, 0.09, -12.0)
        line.rotation_degrees.x = 90.0
        line.set_surface_override_material(0, _material(PALETTE.INK, 0.85))
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
    var mat := _material(PALETTE.GOLD, 0.3)
    mat.emission_enabled = true
    mat.emission = PALETTE.GOLD_LIGHT
    mat.emission_energy_multiplier = 1.4
    gem.set_surface_override_material(0, mat)
    shard.add_child(gem)
    var glow := OmniLight3D.new()
    glow.light_color = PALETTE.GOLD_LIGHT
    glow.light_energy = 2.4
    glow.omni_range = 6.0
    glow.position.y = 1.1
    shard.add_child(glow)
    var halo := MeshInstance3D.new()
    var torus := TorusMesh.new()
    torus.inner_radius = 0.66
    torus.outer_radius = 0.71
    halo.mesh = torus
    halo.rotation_degrees.x = 90.0
    halo.position.y = 0.08
    halo.set_surface_override_material(0, _material(PALETTE.GOLD, 0.42))
    shard.add_child(halo)
    world.add_child(shard)

func _create_enemy() -> void:
    enemy = ENEMY_CONTROLLER.new() as EnemyController
    enemy.name = "HollowEater"
    enemy.player_hit.connect(_on_enemy_player_hit)
    enemy.lunge_started.connect(_on_enemy_lunge_started)
    enemy.defeated.connect(_on_enemy_defeated)
    enemy.position = Vector3(0.0, 0.15, -5.8)
    var torso := MeshInstance3D.new()
    var body := SphereMesh.new()
    body.radius = 0.74
    body.height = 1.65
    torso.mesh = body
    torso.scale = Vector3(0.9, 1.1, 0.86)
    torso.position.y = 0.9
    torso.set_surface_override_material(0, _material(PALETTE.INK_SOFT, 0.8))
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
        limb.set_surface_override_material(0, _material(PALETTE.INK, 0.7))
        enemy.add_child(limb)
    var face := MeshInstance3D.new()
    var slit := SphereMesh.new()
    slit.radius = 0.24
    slit.height = 0.16
    face.mesh = slit
    face.scale = Vector3(1.4, 0.48, 0.3)
    face.position = Vector3(0.0, 1.08, -0.68)
    var face_mat := _material(PALETTE.ABYSS, 0.38)
    face_mat.emission_enabled = true
    face_mat.emission = PALETTE.AZURITE_DEEP
    face.set_surface_override_material(0, face_mat)
    enemy.add_child(face)
    var aura := OmniLight3D.new()
    aura.name = "ThreatPulse"
    aura.light_color = PALETTE.MALACHITE
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
    player_visual.add_child(_capsule("TravelCoat", Vector3(0.0, 0.9, 0.0), Vector3(0.62, 1.05, 0.48), PALETTE.ROBE))
    player_visual.add_child(_capsule("Head", Vector3(0.0, 2.03, -0.02), Vector3(0.28, 0.32, 0.28), PALETTE.SKIN))
    for side in [-1.0, 1.0]:
        player_visual.add_child(_box("Trousers", Vector3(0.18, 0.62, 0.2), Vector3(side * 0.18, 0.31, 0.0), PALETTE.INK_SOFT))
    player_visual.add_child(_box("JadeCloak", Vector3(0.72, 1.0, 0.14), Vector3(0.0, 1.05, 0.24), PALETTE.MALACHITE_DEEP))
    player_visual.add_child(_box("FieldPack", Vector3(0.62, 0.82, 0.35), Vector3(0.0, 1.0, 0.38), PALETTE.OCHRE))
    var blade := _box("WrappedBlade", Vector3(0.09, 1.12, 0.12), Vector3(0.55, 0.7, 0.1), PALETTE.GOLD)
    blade.rotation_degrees.z = -22.0
    player_visual.add_child(blade)
    _create_charge_ring()
    world.add_child(player)

func _create_charge_ring() -> void:
    charge_ring = MeshInstance3D.new()
    charge_ring.name = "ReadingLineHalo"
    var torus := TorusMesh.new()
    torus.inner_radius = 0.92
    torus.outer_radius = 1.06
    charge_ring.mesh = torus
    charge_ring.rotation_degrees.x = 90.0
    charge_ring.position = Vector3(0.0, 0.12, 0.0)
    charge_ring_mat = _material(PALETTE.GOLD_LIGHT, 0.4)
    charge_ring_mat.albedo_color.a = 0.3
    charge_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    charge_ring_mat.emission_enabled = true
    charge_ring_mat.emission = PALETTE.GOLD
    charge_ring.set_surface_override_material(0, charge_ring_mat)
    charge_ring.visible = false
    player.add_child(charge_ring)

func _update_charge_ring() -> void:
    if charge_ring == null:
        return
    charge_ring.visible = phase == PHASE_COMBAT and charge > 0.04
    if not charge_ring.visible:
        return
    charge_ring.scale = Vector3.ONE * (0.75 + charge * 0.65)
    charge_ring_mat.albedo_color.a = 0.22 + charge * 0.6
    charge_ring_mat.emission_energy_multiplier = 0.4 + charge * 2.2

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
    overlay.name = "QingluPostProcess"
    overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
    ink_material = ShaderMaterial.new()
    var shader := Shader.new()
    shader.code = QINGLU_SHADER
    ink_material.shader = shader
    ink_material.set_shader_parameter("shadow_tint", _rgb(PALETTE.GRADE_SHADOW))
    ink_material.set_shader_parameter("mid_tint", _rgb(PALETTE.GRADE_MID))
    ink_material.set_shader_parameter("light_tint", _rgb(PALETTE.GRADE_LIGHT))
    ink_material.set_shader_parameter("gold_tint", _rgb(PALETTE.GRADE_GOLD))
    ink_material.set_shader_parameter("silk_tint", _rgb(PALETTE.GRADE_SILK))
    ink_material.set_shader_parameter("ink_tint", _rgb(PALETTE.GRADE_INK))
    ink_material.set_shader_parameter("distance_tint_color", _rgb(PALETTE.GRADE_DISTANT))
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
    title.add_theme_color_override("font_color", PALETTE.UI_TEXT)
    top.add_child(title)
    var spacer := Control.new()
    spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    top.add_child(spacer)
    status_label = Label.new()
    status_label.text = "凡胎    水：一口"
    status_label.add_theme_font_size_override("font_size", 16)
    status_label.add_theme_color_override("font_color", PALETTE.UI_TEXT)
    top.add_child(status_label)
    objective_label = Label.new()
    objective_label.text = "主线  ·  找到坠星"
    objective_label.add_theme_font_size_override("font_size", 15)
    objective_label.add_theme_color_override("font_color", PALETTE.UI_SUBTEXT)
    root.add_child(objective_label)
    var bottom_spacer := Control.new()
    bottom_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
    root.add_child(bottom_spacer)
    var controls := Label.new()
    controls.text = "WASD 移动   ·   E 互动   ·   空格读线   ·   左键出刀   ·   R 重开"
    controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    controls.add_theme_font_size_override("font_size", 15)
    controls.add_theme_color_override("font_color", PALETTE.UI_TEXT)
    root.add_child(controls)
    var panel_style := StyleBoxFlat.new()
    var panel_bg: Color = PALETTE.UI_PANEL
    panel_bg.a = 0.96
    panel_style.bg_color = panel_bg
    panel_style.border_color = PALETTE.UI_BORDER
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
    speaker_label.add_theme_color_override("font_color", PALETTE.UI_SUBTEXT)
    dialogue_column.add_child(speaker_label)
    dialogue_label = Label.new()
    dialogue_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    dialogue_label.add_theme_font_size_override("font_size", 21)
    dialogue_label.add_theme_color_override("font_color", PALETTE.UI_TEXT)
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
    style.bg_color = PALETTE.UI_BUTTON
    style.set_corner_radius_all(3)
    style.content_margin_left = 14.0
    style.content_margin_right = 14.0
    style.content_margin_top = 7.0
    style.content_margin_bottom = 7.0
    button.add_theme_stylebox_override("normal", style)
    var hover := style.duplicate() as StyleBoxFlat
    hover.bg_color = PALETTE.UI_BUTTON_HOVER
    button.add_theme_stylebox_override("hover", hover)
    button.add_theme_color_override("font_color", PALETTE.UI_BUTTON_TEXT)
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
    var is_instruction := index == TUTORIAL_LINE
    continue_button.visible = not is_instruction
    read_line_button.visible = is_instruction
    dialogue_panel.visible = true
    input_locked = true

func _advance_dialogue() -> void:
    if not input_locked or dialogue_index == TUTORIAL_LINE:
        return
    _play_sound("dialogue")
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
            _play_sound("hit")
        PHASE_RETURN:
            objective_label.text = "主线  ·  登上神殿平台（E）"
            _play_sound("pickup")
        PHASE_COMPLETE:
            input_locked = true
            dialogue_panel.visible = true
            speaker_label.text = "玉山"
            dialogue_label.text = "雾散了。青绿的山一层层向天边退去，回家的路终于有了方向。\n第一卷 · 坠星 / 完\n按 R 重新开始。"
            continue_button.visible = false
            read_line_button.visible = false
            objective_label.text = "序章完成  ·  玉山神殿"
            _play_sound("victory")
        PHASE_FAILED:
            input_locked = true
            dialogue_panel.visible = true
            speaker_label.text = "意识模糊"
            dialogue_label.text = "负荷已经越过极限。\n按 R 重新开始。"
            continue_button.visible = false
            read_line_button.visible = false
            objective_label.text = "任务失败  ·  按 R 重试"
            _play_sound("hurt")
    _update_status()

func _on_enemy_player_hit(damage: float) -> void:
    health = maxf(0.0, health - damage)
    if damage > 1.0:
        impact_flash = maxf(impact_flash, 0.30)
        _play_sound("hurt")
    else:
        impact_flash = maxf(impact_flash, 0.08)

func _on_enemy_lunge_started() -> void:
    _play_sound("lunge")

func _on_enemy_defeated() -> void:
    enemy_active = false
    enemy.queue_free()
    health = minf(100.0, health + 18.0)
    impact_flash = 0.6
    _set_phase(PHASE_RETURN)

func _update_status() -> void:
    if status_label == null:
        return
    var state := "星核已入体" if has_shard else "水：一口"
    if health < 100.0:
        state += "    负荷：%.0f%%" % (100.0 - health)
    if phase == PHASE_COMBAT and enemy_active and is_instance_valid(enemy):
        state += "    噬灵：%d/3" % enemy.health
        state += "    读线：%d%%" % int(charge * 100.0)
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
        objective_label.text = "战斗  ·  读线 %d%%，靠近后左键出刀" % int(charge * 100.0)
    elif phase == PHASE_RETURN:
        objective_label.text = "主线  ·  登上神殿平台（E）"

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
    _play_sound("pickup")

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
        _play_sound("hit")
        if enemy_active and is_instance_valid(enemy):
            enemy.scale = Vector3(0.82, 0.82, 0.82)
            var tween := create_tween()
            tween.tween_property(enemy, "scale", Vector3.ONE, 0.18)
    else:
        objective_label.text = "再靠近些，刀才能还回那股力。"

func _update_shader() -> void:
    if ink_material != null:
        ink_material.set_shader_parameter("edge_strength", 0.72 + charge * 0.5 + impact_flash * 0.8)
        ink_material.set_shader_parameter("gold_strength", 0.30 + charge * 0.5)
        ink_material.set_shader_parameter("wash_strength", 0.24 + ink_meter / 100.0 * 0.3)
        ink_material.set_shader_parameter("grain_strength", 0.018 + impact_flash * 0.045)
        ink_material.set_shader_parameter("charge", charge)
        ink_material.set_shader_parameter("impact", impact_flash)
        ink_material.set_shader_parameter("resolution", Vector2(get_viewport().get_visible_rect().size))

func _rgb(color: Color) -> Vector3:
    return Vector3(color.r, color.g, color.b)

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
