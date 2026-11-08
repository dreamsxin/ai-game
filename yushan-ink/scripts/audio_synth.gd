## 程序化音效：不依赖任何外部音频素材，运行时合成 PCM 短音。
## 游戏侧只调用 play("pickup") 等语义名，波形参数集中在此。
extends Node

const RATE := 22050

var _player: AudioStreamPlayer
var _bank: Dictionary = {}

func _ready() -> void:
    _player = AudioStreamPlayer.new()
    _player.name = "SynthVoice"
    add_child(_player)
    _bank["dialogue"] = _tone(620.0, 620.0, 0.06, 0.10, 22.0)
    _bank["pickup"] = _tone(520.0, 880.0, 0.45, 0.32, 3.2)
    _bank["hit"] = _tone(190.0, 85.0, 0.22, 0.42, 9.0)
    _bank["hurt"] = _tone(150.0, 70.0, 0.30, 0.38, 6.0)
    _bank["lunge"] = _tone(310.0, 205.0, 0.18, 0.24, 8.0)
    _bank["victory"] = _tone(440.0, 660.0, 0.70, 0.28, 1.8)

func play(kind: String) -> void:
    if _player == null or not _bank.has(kind):
        return
    _player.stream = _bank[kind]
    _player.play()

func stop() -> void:
    if _player != null:
        _player.stop()
        _player.stream = null

func _tone(f0: float, f1: float, duration: float, volume: float, decay: float) -> AudioStreamWAV:
    var count := int(RATE * duration)
    var data := PackedByteArray()
    data.resize(count * 2)
    var phase := 0.0
    for i in range(count):
        var t := float(i) / float(RATE)
        var freq := lerpf(f0, f1, clampf(t / duration, 0.0, 1.0))
        phase += TAU * freq / float(RATE)
        var envelope := exp(-t * decay) * minf(1.0, t * 120.0)
        var wave := sin(phase) + 0.28 * sin(phase * 2.0)
        var sample := int(clampf(wave * envelope * volume, -1.0, 1.0) * 32767.0)
        data.encode_s16(i * 2, sample)
    var stream := AudioStreamWAV.new()
    stream.format = AudioStreamWAV.FORMAT_16_BITS
    stream.mix_rate = RATE
    stream.stereo = false
    stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
    stream.data = data
    return stream
