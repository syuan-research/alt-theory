import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/shell/Shell";
import { AppProvider } from "@/context/AppProvider";
import { ShellProvider } from "@/context/ShellContext";
import { TooltipRoot } from "@/components/ui/Tooltip";

export default function App() {
  return (
    <BrowserRouter>
      <TooltipRoot />
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
        <Route path="/config" element={<Navigate to="/?settings=models" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
