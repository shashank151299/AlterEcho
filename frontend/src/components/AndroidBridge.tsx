"import React from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export default function AndroidBridge({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'android') {
    return (
      <WebView 
        source={{ uri: 'https://alter-echo-six.vercel.app/' }} // Replace with your live URL
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
}"