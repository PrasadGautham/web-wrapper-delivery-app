import 'package:firebase_core/firebase_core.dart';

import '../../firebase_options.dart';

class FirebaseBootstrapOptions {
  const FirebaseBootstrapOptions._();

  static FirebaseOptions? get currentPlatform => DefaultFirebaseOptions.currentPlatform;
}
