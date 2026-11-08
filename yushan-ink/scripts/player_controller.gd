class_name PlayerController
extends Node3D

var visual_root: Node3D
var move_speed := 5.2

func bind_visual(root: Node3D) -> void:
    visual_root = root

func move_from_input(delta: float) -> void:
    var axis := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var direction := Vector3(axis.x, 0.0, axis.y).normalized()
    position += direction * move_speed * delta
    position.x = clampf(position.x, -24.0, 24.0)
    position.z = clampf(position.z, -30.0, 21.0)
    if direction.length_squared() > 0.01 and visual_root != null:
        visual_root.rotation.y = atan2(direction.x, direction.z) + PI
