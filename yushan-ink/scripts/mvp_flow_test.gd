extends SceneTree

const GAME_SCRIPT := preload("res://scripts/game.gd")
const PALETTE := preload("res://scripts/ink_palette.gd")

func _initialize() -> void:
    call_deferred("_run")

func _run() -> void:
    assert(PALETTE.MALACHITE != PALETTE.AZURITE, "palette should separate malachite and azurite")
    var game := GAME_SCRIPT.new()
    root.add_child(game)
    await process_frame
    assert(game.audio != null, "procedural audio should be initialized")
    assert(game.charge_ring != null, "reading-line halo should exist")
    assert(game.ink_material.get_shader_parameter("distance_tint_color") != null, "qinglu shader should be palette-driven")

    _advance_intro(game)
    assert(game.phase == game.PHASE_EXPLORE, "intro should enter exploration")
    game.player.position = Vector3(0.0, 0.05, -10.8)
    game._interact()
    assert(game.has_shard, "interacting near the shard should absorb it")
    assert(game.dialogue_index == 5, "shard pickup should start the response dialogue")
    game._advance_dialogue()
    game._advance_dialogue()
    assert(game.dialogue_index == game.TUTORIAL_LINE, "dialogue should reach the combat tutorial")
    game._finish_tutorial()
    game._advance_dialogue()
    game._advance_dialogue()
    assert(game.phase == game.PHASE_COMBAT, "tutorial should activate combat")
    assert(game.enemy_active, "enemy should activate after the tutorial")

    # 未蓄力不能造成有效伤害
    game.player.position = game.enemy.position + Vector3(0.0, 0.0, 1.0)
    game.charge = 0.0
    game._attack()
    assert(game.enemy.health == 3, "an uncharged strike should be rejected")

    for _hit in range(3):
        game.charge = 0.6
        game._attack()
    assert(game.phase == game.PHASE_RETURN, "defeating the enemy should unlock the shrine")
    game.player.position = Vector3(0.0, 0.05, -12.5)
    game._interact()
    assert(game.phase == game.PHASE_COMPLETE, "reaching the shrine should complete the prologue")
    print("MVP flow passed: intro -> explore -> combat -> shrine -> complete")
    game.audio.call("stop")
    game.queue_free()
    for _frame in range(20):
        await process_frame
    quit(0)

func _advance_intro(game: Node) -> void:
    for _step in range(5):
        game._advance_dialogue()
