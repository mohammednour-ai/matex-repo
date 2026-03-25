import React from "react";
import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type RootStackParamList = {
  Main: undefined;
  ListingDetail: { id: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

const TAB_ITEMS = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "listings", label: "Listings", icon: "☰" },
  { key: "search", label: "Search", icon: "⌕" },
  { key: "messages", label: "Messages", icon: "✉" },
  { key: "profile", label: "Profile", icon: "⊙" },
] as const;

type TabKey = (typeof TAB_ITEMS)[number]["key"];

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Coming soon</Text>
    </View>
  );
}

function MainScreen() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("home");

  const content: Record<TabKey, React.ReactNode> = {
    home: <PlaceholderScreen title="Home" />,
    listings: <PlaceholderScreen title="Listings" />,
    search: <PlaceholderScreen title="Search" />,
    messages: <PlaceholderScreen title="Messaging" />,
    profile: <PlaceholderScreen title="Profile" />,
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{content[activeTab]}</View>
      <View style={styles.tabBar}>
        {TAB_ITEMS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text
              style={[
                styles.tabIcon,
                activeTab === tab.key && styles.tabActive,
              ]}
            >
              {tab.icon}
            </Text>
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.key && styles.tabActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Main"
            component={MainScreen}
            options={{ title: "Matex", headerShown: false }}
          />
          <Stack.Screen
            name="ListingDetail"
            component={() => <PlaceholderScreen title="Listing Detail" />}
            options={{ title: "Listing" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  content: {
    flex: 1,
  },
  screen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6c757d",
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#dee2e6",
    backgroundColor: "#ffffff",
    paddingBottom: 20,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 20,
    color: "#6c757d",
  },
  tabLabel: {
    fontSize: 11,
    color: "#6c757d",
    marginTop: 2,
  },
  tabActive: {
    color: "#0d6efd",
  },
});
