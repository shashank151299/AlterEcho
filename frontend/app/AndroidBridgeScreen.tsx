"import React from 'react';
import { WebView } from 'react-native-webview';

export default function AndroidBridge() {
  return (
    <WebView 
      source={{ uri: 'https://alterecho.vercel.app' }} 
      style={{ flex: 1 }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      allowsInlineMediaPlayback={true}
      mediaPlaybackRequiresUserGesture={false}
      onPermissionRequest={(event) => {
        event.grant();
      }}
    />
  );
}"