import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';
import { ThemeProvider } from "./src/theme/ThemeProvider";
import { HomeScreen } from "./src/screens/HomeScreen";

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <HomeScreen />
        <StatusBar style="auto" />
      </SafeAreaView>
    </ThemeProvider>
  );
}
 
