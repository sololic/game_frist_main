// src/App.jsx

// 1. 기존의 useState, reactLogo, viteLogo, './App.css' import를 모두 제거했습니다.
import TurnBasedRPG from './TurnBasedRPG'; // 턴제 RPG 컴포넌트를 불러옵니다.

function App() {
  return (
    // 2. 기존의 로고, 카운터 버튼 등의 HTML/JSX 코드를 모두 제거했습니다.
    // Tailwind CSS 클래스를 사용하여 전체 화면 스타일과 중앙 정렬을 설정합니다.
    <div className="min-h-screen bg-gray-100 flex items-start justify-center pt-10">
      <TurnBasedRPG /> {/* 여기에 RPG 컴포넌트가 렌더링됩니다. */}
    </div>
  );
}

export default App;