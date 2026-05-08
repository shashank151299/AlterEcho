import React from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

type AndroidBridgeProps = {
  children: React.ReactNode;
};

export default function AndroidBridge({ children }: AndroidBridgeProps) {
  if (Platform.OS === 'android') {
    return (
      <WebView
        source={{ uri: 'https://alter-echo-six.vercel.app/' }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserGesture={false}
        originWhitelist={['*']}
      />
    );
  }

  return <>{children}</>;
}
