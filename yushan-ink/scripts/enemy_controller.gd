class_name EnemyController
extends Node3D

signal defeated
signal player_hit(damage: float)
signal lunge_started

const CONTACT_DPS := 1.6
const LUNGE_DAMAGE := 11.0
const LUNGE_RANGE := 3.2

var active := false
var health := 3
var phase := 0.0

var _cooldown := 1.6
var _windup := 0.0
var _lunge_time := 0.0
var _lunge_dir := Vector3.ZERO

func tick(delta: float, target: Node3D) -> void:
    if not active or target == null or not is_instance_valid(target):
        return
    phase += delta
    rotation.y = sin(phase * 0.8) * 0.18
    var to_target := target.global_position - global_position
    var distance := to_target.length()

    if _lunge_time > 0.0:
        _lunge_time -= delta
        global_position += _lunge_dir * delta * 7.0
        if _lunge_time <= 0.0:
            var after := target.global_position - global_position
            if after.length() < LUNGE_RANGE:
                player_hit.emit(LUNGE_DAMAGE)
            _cooldown = 2.4
    elif _windup > 0.0:
        _windup -= delta
        scale = Vector3.ONE * (1.0 + (0.45 - maxf(_windup, 0.0)) * 0.24)
        if _windup <= 0.0:
            scale = Vector3.ONE
            _lunge_time = 0.28
            _lunge_dir = to_target.normalized()
    else:
        scale = scale.lerp(Vector3.ONE, minf(delta * 8.0, 1.0))
        if distance > 2.25 and distance < 13.0:
            global_position += to_target.normalized() * delta * 1.1
        if distance <= 2.25:
            player_hit.emit(delta * CONTACT_DPS)
        _cooldown -= delta
        if distance < 5.0 and _cooldown <= 0.0:
            _windup = 0.45
            lunge_started.emit()

    var pulse := get_node_or_null("ThreatPulse") as OmniLight3D
    if pulse != null:
        pulse.light_energy = 0.14 + absf(sin(phase * 2.0)) * 0.58 + _windup * 1.6

func receive_hit() -> void:
    if not active:
        return
    health -= 1
    if health <= 0:
        active = false
        defeated.emit()
