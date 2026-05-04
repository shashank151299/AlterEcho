"import os

file_path = 'frontend/app/index.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add the import
if 'import { WebView } from \'react-native-webview\';' not in content:
    content = content.replace(\"from 'react-native';\", \"from 'react-native';\\nimport { WebView } from 'react-native-webview';\")

# 2. Inject the Android WebView bridge
target = 'export default function AlterEchoScreen() {'
replacement = 'export default function AlterEchoScreen() {\\n  if (process.env.NODE_ENV === \"production\" || true) {\\n    if (require(\'react-native\').Platform.OS === \'android\') {\\n      return <WebView source={{ uri: \'https://alterecho.vercel.app\' }} style={{ flex: 1 }} javaScriptEnabled={true} domStorageEnabled={true} allowsInlineMediaPlayback={true} mediaPlaybackRequiresUserGesture={false} />\\n    }\\n  }'

if target in content:
    content = content.replace(target, replacement)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Successfully patched index.tsx')
"