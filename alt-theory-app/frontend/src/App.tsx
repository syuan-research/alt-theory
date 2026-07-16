import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/shell/Shell";
import { AppProvider } from "@/context/AppProvider";
import { ShellProvider } from "@/context/ShellContext";
import { ConfigRoute } from "@/pages/ConfigRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppProvider>
              <ShellProvider>
                <Shell />
              </ShellProvider>
            </AppProvider>
          }
        />
        <Route path="/config" element={<ConfigRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
