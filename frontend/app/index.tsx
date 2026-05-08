import React from " react\;
import { Platform } from \react-native\;
import AndroidBridge from \./AndroidBridgeScreen\;
import AlterEchoScreen from \./index.native\;

export default function Page() {
 if (Platform.OS === \android\) {
 return <AndroidBridge />;
 }
 return <AlterEchoScreen />;
}
