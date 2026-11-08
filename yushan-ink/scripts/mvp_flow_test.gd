extends SceneTree

const GAME_SCRIPT := preload("res://scripts/game.gd")

func _initialize() -> void:
    call_deferred("_run")

func _run() -> void:
    var game := GAME_SCRIPT.new()
    root.add_child(game)
    await process_frame
    _advance_intro(game)
    assert(game.phase == game.PHASE_EXPLORE, "intro should enter exploration")
    game.player.position = Vector3(0.0, 0.05, -10.8)
    game._interact()
    assert(game.has_shard, "interacting near the shard should absorb it")
    assert(game.dialogue_index == 5, "shard pickup should start the response dialogue")
    game._advance_dialogue()
    game._advance_dialogue()
    assert(game.dialogue_index == 7, "dialogue should reach the combat tutorial")
    game._finish_tutorial()
    game._advance_dialogue()
    game._advance_dialogue()
    assert(game.phase == game.PHASE_COMBAT, "tutorial should activate combat")
    assert(game.enemy_active, "enemy should activate after the tutorial")
    game.player.position = game.enemy.position + Vector3(0.0, 0.0, 1.0)
    for _hit in range(3):
        game.charge = 0.6
        game._attack()
    assert(game.phase == game.PHASE_RETURN, "defeating the enemy should unlock the shrine")
    game.player.position = Vector3(0.0, 0.05, -12.5)
    game._interact()
    assert(game.phase == game.PHASE_COMPLETE, "reaching the shrine should complete the prologue")
    print("MVP flow passed: intro -> explore -> combat -> shrine -> complete")
    quit(0)

func _advance_intro(game: Node) -> void:
    for _step in range(5):
        game._advance_dialogue()
