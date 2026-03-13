import 'package:audioplayers/audioplayers.dart';
import 'package:logger/logger.dart';

class LoopingAlertPlayer {
  LoopingAlertPlayer(this._logger);

  final Logger _logger;
  final AudioPlayer _player = AudioPlayer();
  bool _configured = false;
  bool _playing = false;

  Future<void> start() async {
    if (_playing) {
      return;
    }

    try {
      if (!_configured) {
        await _player.setReleaseMode(ReleaseMode.loop);
        _configured = true;
      }
      await _player.play(AssetSource('audio/order_alert.wav'));
      _playing = true;
    } catch (error, stackTrace) {
      _logger.w(
        'Unable to start incoming order alert sound.',
        error: error,
        stackTrace: stackTrace,
      );
    }
  }

  Future<void> stop() async {
    if (!_playing) {
      return;
    }

    try {
      await _player.stop();
    } catch (error, stackTrace) {
      _logger.w(
        'Unable to stop incoming order alert sound.',
        error: error,
        stackTrace: stackTrace,
      );
    } finally {
      _playing = false;
    }
  }

  Future<void> dispose() async {
    await stop();
    await _player.dispose();
  }
}
