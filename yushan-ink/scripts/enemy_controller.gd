class_name EnemyController
extends Node3D

signal defeated
signal player_hit(damage: float)

var active := false
var health := 3
var phase := 0.0

func tick(delta: float, target: Node3D) -> void:
    if not active or target == null or not is_instance_valid(target):
        return
    phase += delta
    rotation.y = sin(phase * 0.8) * 0.18
    var to_target := target.global_position - global_position
    var distance := to_target.length()
    if distance > 2.25 and distance < 13.0:
        global_position += to_target.normalized() * delta * 1.1
    elif distance <= 2.25:
        player_hit.emit(delta * 4.0)
    var pulse := get_node_or_null("ThreatPulse") as OmniLight3D
    if pulse != null:
        pulse.light_energy = 0.14 + absf(sin(phase * 2.0)) * 0.58

func receive_hit() -> void:
    if not active:
        return
    health -= 1
    if health <= 0:
        active = false
        defeated.emit()
