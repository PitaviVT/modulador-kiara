- npm run android
- npm run ios # you need to use macOS to build the iOS project - use the Expo app if you need to do iOS development without a Mac
- npm run web

git config --global user.email "pitavivtuber@gmail.com"
git config --global user.name "PitaviVT"

npx expo start --tunnel

# eliminar cache
npx expo start -c --tunnel

# paquetes a instalar

npx expo install @tensorflow/tfjs @tensorflow/tfjs-react-native expo-gl

# dev tools
react-devtools