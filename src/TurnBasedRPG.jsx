import React, { useState, useEffect, useRef } from 'react';
import { Sword, Shield, Heart, Zap, Package, Map, Users, Trophy, Save, ShoppingBag, X, Cloud, ChevronsUp } from 'lucide-react';
import io from 'socket.io-client'; // ⬅️ Socket.io 클라이언트 임포트

// 🚨 중요: 서버 주소와 포트 (Node.js 서버가 실행되는 주소)
const SERVER_URL = 'https://game-ql52-gjtuxelwp-1592s-projects.vercel.app/'; 
// const SERVER_URL = 'http://localhost:3456'; 
const socket = io(SERVER_URL, { autoConnect: false }); // 연결 객체 생성

// 유틸: 난수
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// 플레이어 기본 상태 객체 생성 함수
const getInitialPlayerState = (userId) => ({
    name: '용사',
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    baseAttack: 15,
    baseDefense: 8,
    attack: 15,   
    defense: 8,   
    exp: 0,
    expToNext: 100,
    gold: 50,
    inventory: [
        { id: 1, name: '체력 포션', type: 'potion', effect: 'heal', value: 50, count: 3, price: 30 },
        { id: 2, name: '마나 포션', type: 'potion', effect: 'mana', value: 30, count: 2, price: 25 },
    ],
    equipment: {
        weapon: { id: 101, name: '낡은 검', attack: 5, price: 0 },
        armor: { id: 201, name: '천 갑옷', defense: 3, price: 0 },
    },
    location: 'town',
    quests: [],
    userId: userId, 
    saveId: 'slot1',
    lastSaved: null,
});

const shopItems = [
    { id: 301, name: '고급 검', type: 'weapon', attack: 10, price: 100 },
    { id: 302, name: '강철 방패', type: 'armor', defense: 7, price: 80 },
    { id: 1, name: '체력 포션', type: 'potion', effect: 'heal', value: 50, price: 30 },
    { id: 2, name: '마나 포션', type: 'potion', effect: 'mana', value: 30, price: 25 },
];
const skills = [
    { id: 1, name: '파워 슬래시', mpCost: 10, effect: 'damage_boost', multiplier: 1.5, description: '공격력 1.5배 피해' },
    { id: 2, name: '수호 방패', mpCost: 5, effect: 'defense_boost', value: 5, description: '방어력 5 증가 (1턴)' },
  ];


const TurnBasedRPG = () => {
  // 가상의 로그인 상태
  const [currentUserId, setCurrentUserId] = useState('user_A'); 

  // gameState: menu, game, battle, inventory, map, shop, duel_lobby
  const [gameState, setGameState] = useState('menu');

  // 플레이어 상태
  const [player, setPlayer] = useState(getInitialPlayerState(currentUserId));

  // 적/상대방 상태
  const [enemy, setEnemy] = useState(null);
  const [battleLog, setBattleLog] = useState([]);
  const [turn, setTurn] = useState('player'); 
  
  // UI 상태 (생략된 기타 상태들)
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [showInventoryInBattle, setShowInventoryInBattle] = useState(false);
  const [showEquipmentMenu, setShowEquipmentMenu] = useState(false);
  const [showShop, setShowShop] = useState(false); // (미사용)
  const [shopTab, setShopTab] = useState('buy'); 
  const [showLevelUpModal, setShowLevelUpModal] = useState(false); 

  // ⭐ 멀티플레이어 관련 상태
  const [multiplayerState, setMultiplayerState] = useState('offline'); // offline, searching, ready, in_duel
  const [opponent, setOpponent] = useState(null); 
  const [duelLog, setDuelLog] = useState([]); 
  const [isConnected, setIsConnected] = useState(false); // 소켓 연결 상태
  const [duelRoomId, setDuelRoomId] = useState(null); // 현재 듀얼 방 ID


  // ---------- 장비 스탯 재계산 ----------
  const recalcStats = (p) => {
    const weaponAtk = p.equipment.weapon?.attack || 0;
    const armorDef = p.equipment.armor?.defense || 0;
    return {
      ...p,
      attack: p.baseAttack + weaponAtk,
      defense: p.baseDefense + armorDef,
    };
  };

  // ---------- 레벨업 로직 (경험치 획득 시 호출) ----------
  const checkLevelUp = (p, expEarned) => {
    let newExp = p.exp + expEarned;
    let newLevel = p.level;
    let newExpToNext = p.expToNext;
    let leveledUp = false;

    while (newExp >= newExpToNext) {
      newExp -= newExpToNext;
      newLevel += 1;
      newExpToNext = 100 + newLevel * 50; // 다음 레벨 필요 경험치 증가
      
      // 기본 스탯 증가
      p.baseAttack += 3;
      p.baseDefense += 2;
      p.maxHp += 20;
      p.maxMp += 10;
      leveledUp = true;
    }

    const newPlayer = {
      ...p,
      level: newLevel,
      exp: newExp,
      expToNext: newExpToNext,
      hp: leveledUp ? p.maxHp : p.hp, // 레벨업 시 HP/MP 풀 회복
      mp: leveledUp ? p.maxMp : p.mp,
    };

    if (leveledUp) {
      setBattleLog((prev) => [...prev, `🎉 레벨 ${newLevel} 달성!`]);
      setShowLevelUpModal(true);
    }

    return recalcStats(newPlayer);
  };

  // ---------- 상태 초기화 및 메뉴 복귀 ----------
  const resetPlayerState = () => {
    if (!window.confirm('현재 플레이어의 모든 진행 상황을 초기화하고 로컬 저장 데이터를 삭제하시겠습니까?')) return;

    const key = `turnBasedRPG_save_${player.userId}_slot1`;
    localStorage.removeItem(key);

    const initialState = getInitialPlayerState(player.userId);
    setPlayer(recalcStats(initialState));
    setEnemy(null);
    setGameState('game');
    alert('캐릭터 진행 상황이 초기화되었습니다.');
  };

  const goToMainMenu = () => {
    setGameState('menu');
    setEnemy(null);
    setMultiplayerState('offline');
    setDuelRoomId(null); // 방 정보 초기화
  };


  // ---------- 저장 / 불러오기 (API 통신 필요) ----------

  const getLocalStorageKey = (userId) => `turnBasedRPG_save_${userId}_slot1`;

  const saveToLocal = () => {
    // ... (로컬 저장 로직)
    const data = {
      player,
      enemy,
      gameState,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(getLocalStorageKey(player.userId), JSON.stringify(data));
    setPlayer((prev) => ({
      ...prev,
      lastSaved: data.timestamp,
    }));
  };

  const loadFromLocal = (userIdToLoad = currentUserId) => {
    // ... (로컬 불러오기 로직)
    const raw = localStorage.getItem(getLocalStorageKey(userIdToLoad));
    if (!raw) {
      setPlayer(recalcStats(getInitialPlayerState(userIdToLoad)));
      setEnemy(null);
      setGameState('menu');
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (data.player) {
        const fixedPlayer = recalcStats({...data.player, userId: userIdToLoad});
        setPlayer(fixedPlayer);
      }
      if (data.enemy) setEnemy(data.enemy);
      if (data.gameState) setGameState(data.gameState);
      if (data.timestamp) {
        setPlayer((prev) => ({
          ...prev,
          lastSaved: data.timestamp,
        }));
      }
    } catch (e) {
      console.error('로드 중 오류:', e);
    }
  };

  const saveToCloud = async () => {
    // 🚨 Node.js API 서버와 통신합니다. (HTTP POST)
    try {
      const response = await fetch(`${SERVER_URL}/api/save/${player.userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player }),
      });
      if (response.ok) {
        const data = await response.json();
        setPlayer((prev) => ({ ...prev, lastSaved: new Date().toISOString() }));
        alert(`클라우드 저장 성공!`);
      } else {
        alert('클라우드 저장 실패: 서버 오류');
      }
    } catch (error) {
      alert('클라우드 저장 실패: 서버 연결 오류');
    }
  };

  const loadFromCloud = async () => {
    // 🚨 Node.js API 서버와 통신합니다. (HTTP GET)
    try {
      const response = await fetch(`${SERVER_URL}/api/load/${currentUserId}`);
      if (response.ok) {
        const data = await response.json();
        const fixedPlayer = recalcStats({...data.player, userId: currentUserId});
        setPlayer(fixedPlayer);
        setGameState('game');
        alert('클라우드 불러오기 성공!');
      } else {
        alert('클라우드 불러오기 실패: 저장된 데이터가 없습니다.');
      }
    } catch (error) {
      alert('클라우드 불러오기 실패: 서버 연결 오류');
    }
  };

  // ---------- Socket.io 서버 연결 및 이벤트 리스너 설정 ----------
  useEffect(() => {
    console.log('소켓 연결 시도:', SERVER_URL);
    socket.connect(); 

    const onConnect = () => {
      setIsConnected(true);
      console.log('✅ Socket Connected!');
      // 연결 성공 시 유저 등록 (개인 방 가입)
      socket.emit('registerUser', currentUserId); 
    };

    const onDisconnect = () => {
      setIsConnected(false);
      console.log('❌ Socket Disconnected!');
    };
    
    // ⚔️ 매칭 성공 이벤트 수신 ⚔️
    const onMatchFound = ({ room, opponent, isFirstPlayer }) => {
      console.log('매칭을 찾았습니다!', { room, opponent });
      setDuelRoomId(room);
      // 상대방의 레벨을 기반으로 임시 적 상태를 업데이트
      setOpponent({
        name: opponent.name,
        level: opponent.level || 1,
        attack: opponent.level * 3 + getRandomInt(5, 10),
        defense: opponent.level * 1 + getRandomInt(5, 10),
        maxHp: opponent.hp || 100,
        hp: opponent.hp || 100,
        expReward: 100,
        goldReward: 50,
      });
      setMultiplayerState('ready');
      setDuelLog((prev) => [
        ...prev, 
        `매칭 완료! 상대: ${opponent.name}. ${isFirstPlayer ? '당신이 선공입니다! (먼저 시작 버튼을 누르세요)' : '상대방이 시작 버튼을 기다립니다.'}`
      ]);
    };

    // ⚔️ 상대방의 액션 결과 수신 (듀얼 핵심 로직) ⚔️
    const onOpponentAction = ({ type, damage, log, nextTurn, enemyHp }) => {
      // 1. 로그 업데이트
      setBattleLog((prev) => [...prev, `[상대] ${log}`]);
      
      // 2. 내 캐릭터 HP 업데이트 (데미지 처리)
      if (type === 'attack') {
        setPlayer((prev) => {
          const newHp = Math.max(prev.hp - damage, 0);
          if (newHp === 0) {
            // 패배 처리 (나중에 endBattle('lose') 호출 필요)
          }
          return { ...prev, hp: newHp };
        });
      }

      // 3. 턴 전환
      setTurn(nextTurn);
    };


    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('matchFound', onMatchFound);
    socket.on('opponentAction', onOpponentAction);

    // 클린업 함수
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('matchFound', onMatchFound);
      socket.off('opponentAction', onOpponentAction);
      // 컴포넌트 언마운트 시 소켓 연결 해제
      socket.disconnect();
    };
    // currentUserId가 바뀔 때마다 소켓을 다시 연결하고 등록합니다.
  }, [currentUserId]); 

  
  // ---------- 멀티플레이어 대결 로직 수정 (서버 통신) ----------

  const handleDuelStart = async () => {
    if (multiplayerState !== 'offline' || !isConnected) {
      setDuelLog([isConnected ? '이미 대기 중이거나 듀얼 상태입니다.' : '❌ 서버에 연결되지 않았습니다. 서버를 실행해 주세요.']);
      setGameState('duel_lobby');
      return;
    }

    setMultiplayerState('searching');
    setDuelLog(['상대방을 찾고 있습니다. 상대방도 대결 버튼을 눌러야 매칭이 시작됩니다.']);
    setGameState('duel_lobby');

    // 🚨 서버에 매칭 시작 이벤트 전송
    // 현재 플레이어의 주요 스탯을 서버로 보냅니다.
    socket.emit('searchForDuel', { 
      userId: currentUserId, 
      playerStats: { 
        name: player.name, 
        level: player.level, 
        attack: player.attack, 
        defense: player.defense, 
        hp: player.hp,
        maxHp: player.maxHp
      } 
    });
  };


  const startDuel = () => {
    if (multiplayerState !== 'ready' || !opponent || !duelRoomId) return;

    // 🚨 서버에 듀얼 시작 준비 완료를 알림
    socket.emit('readyToStartDuel', { userId: currentUserId, room: duelRoomId });
    
    // ➡️ 대결 시작 상태로 전환 (턴은 서버에서 결정한 대로 시작)
    setMultiplayerState('in_duel');
    setEnemy(opponent); 
    setTurn('player'); // 일단 'player'로 설정하고, 서버의 응답을 기다립니다.
    setBattleLog(['⚔️ 유저 대결 시작!']); 
    setGameState('battle'); 
  };

  // ---------- 전투 관련 (함수 수정) ----------

  const endBattle = (result) => {
    let expEarned = 0;
    let goldEarned = 0;

    if (result === 'win' && enemy) {
      expEarned = enemy.expReward || 0;
      goldEarned = enemy.goldReward || 0;
      setBattleLog((prev) => [...prev, `경험치 ${expEarned}과 골드 💰${goldEarned}를 획득했다!`]);
      
      setPlayer((prev) => {
        const newPlayer = {
          ...prev,
          gold: prev.gold + goldEarned,
        };
        return checkLevelUp(newPlayer, expEarned); // 레벨업 체크
      });
    } else if (result === 'lose') {
      setBattleLog((prev) => [...prev, '패배하여 마을로 귀환합니다.']);
      setPlayer((prev) => ({ 
        ...prev, 
        hp: Math.floor(prev.maxHp * 0.5), // HP 50%로 부활
        gold: Math.max(0, prev.gold - 10) // 소량의 골드 손실
      }));
    } else if (result === 'run') {
      setBattleLog((prev) => [...prev, '성공적으로 도망쳤습니다!']);
    }
    
    setEnemy(null);
    setGameState('game');
    setBattleLog([]); // 로그 초기화
    setMultiplayerState('offline'); // 듀얼 종료 시 초기화
    setDuelRoomId(null); // 방 ID 초기화
  };

  const handlePlayerAttack = () => {
    if (!enemy) return;

    const baseDamage = Math.max(0, player.attack - Math.floor(enemy.defense * 0.7));
    const damage = Math.max(baseDamage + getRandomInt(-3, 3), 0);
    const logMessage = `용사의 공격! ${damage}의 피해를 입혔다.`;

    // 1. 듀얼 전투인 경우 (서버에 액션 전송)
    if (multiplayerState === 'in_duel' && duelRoomId) {
      if (turn !== 'player') {
        setBattleLog((prev) => [...prev, '상대방의 턴입니다. 잠시 기다려주세요.']);
        return;
      }

      // 🚨 서버에 공격 액션을 보냅니다.
      socket.emit('duelAction', {
        room: duelRoomId,
        userId: currentUserId,
        type: 'attack',
        damage: damage, // 클라이언트에서 계산한 데미지를 일단 보냄 (서버에서 재검증 필요)
        log: logMessage,
        nextTurn: 'enemy' // 다음 턴을 상대방으로 넘김
      });
      setBattleLog((prev) => [...prev, logMessage]);
      setTurn('enemy'); // 턴을 넘깁니다. (실제 턴은 서버가 관리)
      return;
    }

    // 2. 일반 전투인 경우 (기존 로직)
    const newEnemy = { ...enemy, hp: Math.max(enemy.hp - damage, 0) };
    setEnemy(newEnemy);
    setBattleLog((prev) => [...prev, logMessage]);

    if (newEnemy.hp <= 0) {
      setBattleLog((prev) => [...prev, `${enemy.name}을(를) 쓰러뜨렸다!`]);
      endBattle('win');
    } else {
      setTurn('enemy');
    }
  };

// TurnBasedRPG 컴포넌트 내부, handlePlayerAttack 근처에 추가

  const handlePlayerSkill = (skill) => {
    if (!enemy || player.mp < skill.mpCost) {
      setBattleLog((prev) => [...prev, 'MP가 부족합니다!']);
      return;
    }

    let logMessage = '';
    setPlayer((prev) => ({ ...prev, mp: prev.mp - skill.mpCost })); // MP 소모

    if (skill.effect === 'damage_boost') {
      const baseDamage = Math.max(0, player.attack - Math.floor(enemy.defense * 0.7));
      const rawDamage = Math.floor(baseDamage * skill.multiplier);
      const damage = Math.max(rawDamage + getRandomInt(-3, 3), 0);

      // 몬스터 HP 업데이트 (싱글 플레이 기준)
      const newEnemy = { ...enemy, hp: Math.max(enemy.hp - damage, 0) };
      setEnemy(newEnemy);

      logMessage = `🔥 용사가 ${skill.name}을(를) 사용! ${damage}의 강력한 피해를 입혔다.`;

      if (newEnemy.hp <= 0) {
        setBattleLog((prev) => [...prev, logMessage, `${enemy.name}을(를) 쓰러뜨렸다!`]);
        endBattle('win');
        return; // 전투 종료 시 턴 넘기지 않음
      }
    } 
    // else if (skill.effect === 'defense_boost') { ... } // 다른 스킬 구현...

    setBattleLog((prev) => [...prev, logMessage]);
    setShowSkillMenu(false); // 스킬 메뉴 닫기
    setTurn('enemy'); // 턴 넘기기
  };

  const handleEnemyTurn = () => {
    // 듀얼 전투 중에는 서버의 응답을 기다립니다.
    if (multiplayerState === 'in_duel') {
        // 상대방의 턴은 onOpponentAction 리스너를 통해 처리됩니다.
        return; 
    }

    // 일반 전투는 AI 턴 실행
    if (!enemy) return;
    const baseDamage = Math.max(0, enemy.attack - Math.floor(player.defense * 0.7));
    const damage = Math.max(baseDamage + getRandomInt(-2, 2), 0);
    
    const newPlayerHp = Math.max(player.hp - damage, 0);

    setPlayer((prev) => ({
        ...prev,
        hp: newPlayerHp,
    }));
    setBattleLog((prev) => [...prev, `${enemy.name}의 공격! ${damage}의 피해를 입었다.`]);

    if (newPlayerHp <= 0) {
        setBattleLog((prev) => [...prev, '용사는 쓰러졌다...']);
        endBattle('lose');
    } else {
        setTurn('player');
    }
  };

  useEffect(() => { 
    if (gameState === 'battle' && turn === 'enemy' && enemy) {
      if (multiplayerState === 'in_duel') {
        // 듀얼 중에는 상대방의 액션을 서버로부터 기다립니다.
        return; 
      }

      // 일반 전투는 AI 턴 실행
      const timer = setTimeout(() => {
        handleEnemyTurn();
      }, 800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, gameState, enemy, multiplayerState, player.hp, player.defense]);


  // ---------- 아이템 사용 로직 (인벤토리에서 호출) ----------
  const handleUseItem = (item) => {
    if (item.type === 'potion') {
      setPlayer((prev) => {
        const newInventory = prev.inventory.map((invItem) => 
          invItem.id === item.id 
          ? { ...invItem, count: invItem.count - 1 } 
          : invItem
        ).filter(invItem => invItem.count > 0);
        
        let newHp = prev.hp;
        let newMp = prev.mp;
        let logMessage = '';

        if (item.effect === 'heal') {
          newHp = Math.min(prev.maxHp, prev.hp + item.value);
          logMessage = `${item.name}을(를) 사용해 HP ${item.value}를 회복했다.`;
        } else if (item.effect === 'mana') {
          newMp = Math.min(prev.maxMp, prev.mp + item.value);
          logMessage = `${item.name}을(를) 사용해 MP ${item.value}를 회복했다.`;
        }

        if (gameState === 'battle') {
          setBattleLog((prevLog) => [...prevLog, logMessage]);
          setShowInventoryInBattle(false);
          setTurn('enemy'); // 전투 중 아이템 사용 후 턴 넘김
        } else {
          alert(logMessage);
        }

        return { ...prev, hp: newHp, mp: newMp, inventory: newInventory };
      });
    }
  };

  // ---------- 장비 장착 로직 ----------
  const handleEquipItem = (item) => {
    // 아이템 목록에서 장착하려는 아이템을 찾음 (인벤토리가 아닌 shopItems에서 찾음)
    const itemToEquip = shopItems.find(i => i.id === item.id);
    if (!itemToEquip) return;

    setPlayer((prev) => {
      let newInventory = [...prev.inventory];
      let newEquipment = { ...prev.equipment };
      let oldItem = null;

      if (itemToEquip.type === 'weapon') {
        oldItem = newEquipment.weapon;
        newEquipment.weapon = itemToEquip;
      } else if (itemToEquip.type === 'armor') {
        oldItem = newEquipment.armor;
        newEquipment.armor = itemToEquip;
      } else {
        return prev; // 포션 등은 장착 불가
      }

      // 인벤토리에서 장착 아이템 제거 (이미 장착된 것으로 간주)
      newInventory = newInventory.filter(i => i.id !== item.id); 

      // 기존 장비는 인벤토리로 되돌림
      if (oldItem) {
        // 기존 장비가 인벤토리에 있을 경우 count를 1 증가시키거나, 없을 경우 새로 추가
        const existingItemIndex = newInventory.findIndex(i => i.id === oldItem.id);
        if (existingItemIndex > -1) {
          newInventory[existingItemIndex].count += 1;
        } else {
          newInventory.push({...oldItem, count: 1});
        }
      }

      const updatedPlayer = { ...prev, equipment: newEquipment, inventory: newInventory };
      alert(`${itemToEquip.name}을(를) 장착했습니다.`);
      return recalcStats(updatedPlayer);
    });
  };

// ---------- UI 렌더링 함수들 시작 ----------

  // 플레이어 상태 화면 (GameScreen, BattleScreen에서 사용)
  const renderPlayerStatus = () => (
    <div className="p-4 bg-white shadow-lg rounded-lg mb-4 border border-gray-200">
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
        {player.name} (Lv.{player.level})
      </h2>
      <div className="space-y-1 text-sm">
        {/* HP Bar */}
        <div className="flex items-center gap-2">
          <Heart size={16} className="text-red-500" />
          HP: <span className="font-semibold">{player.hp}/{player.maxHp}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-red-500 h-2 rounded-full" 
            style={{ width: `${(player.hp / player.maxHp) * 100}%` }}
          ></div>
        </div>

        {/* MP Bar */}
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-blue-500" />
          MP: <span className="font-semibold">{player.mp}/{player.maxMp}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full" 
            style={{ width: `${(player.mp / player.maxMp) * 100}%` }}
          ></div>
        </div>
        
        {/* EXP Bar */}
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-500" />
          EXP: <span className="font-semibold">{player.exp}/{player.expToNext}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-yellow-500 h-2 rounded-full" 
            style={{ width: `${(player.exp / player.expToNext) * 100}%` }}
          ></div>
        </div>
        
        <p className="text-xs text-gray-500 mt-2">
          공격력: {player.attack}, 방어력: {player.defense}, 골드: 💰{player.gold}
        </p>
      </div>
    </div>
  );

  const renderMenu = () => (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-3xl font-bold mb-4">턴제 RPG 데모 (유저: {currentUserId})</h1>
      
      {/* 1. 서버 연결 상태 표시 */}
      <div className={`p-3 border rounded text-sm w-full max-w-sm text-center ${isConnected ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'}`}>
        {isConnected ? '✅ 서버 연결됨 (WebSocket)' : '❌ 서버 연결 끊김 (WebSocket)'}
      </div>

      {/* 2. 게임 시작/계속 버튼 */}
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full max-w-sm font-bold"
        onClick={() => setGameState('game')} 
      >
        게임 시작 / 계속
      </button>
      
      {/* 3. 로드 버튼 */}
      <button
        className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 w-full max-w-sm flex items-center justify-center gap-2"
        onClick={loadFromCloud}
      >
        <Cloud size={16} /> 클라우드 데이터 불러오기
      </button>

      {/* 4. 유저 전환 버튼 (개발 편의용) */}
      <button
        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 w-full max-w-sm text-sm"
        onClick={() => {
          const newUserId = currentUserId === 'user_A' ? 'user_B' : 'user_A';
          setCurrentUserId(newUserId);
          loadFromLocal(newUserId);
          alert(`${currentUserId}에서 ${newUserId}로 유저 전환됨. (서버 소켓 재연결 시도)`);
        }}
      >
        유저 전환: {currentUserId} ➡️ {currentUserId === 'user_A' ? 'user_B' : 'user_A'}
      </button>
      
      {/* 5. 초기화 버튼 */}
      <button
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-full max-w-sm text-sm"
        onClick={resetPlayerState}
      >
        캐릭터 초기화
      </button>
    </div>
  );

// ---------- 게임 화면 렌더링 ----------
  const renderGameScreen = () => ( 
    <div>
      {renderPlayerStatus()}

      <div className="mb-4 flex flex-wrap gap-2">
        {/* 지도 버튼 */}
        <button
            className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
            onClick={() => setGameState('map')}
        >
            <Map size={16} />
            지도
        </button>
        
        {/* 인벤토리 버튼 */}
        <button
            className="px-3 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 flex items-center gap-1"
            onClick={() => setGameState('inventory')}
        >
            <Package size={16} />
            인벤토리
        </button>
        
        {/* 상점 버튼 */}
        <button
            className="px-3 py-2 bg-pink-500 text-white rounded hover:bg-pink-600 flex items-center gap-1"
            onClick={() => setGameState('shop')}
        >
            <ShoppingBag size={16} />
            상점
        </button>
        
        {/* 유저 대결 버튼 (멀티플레이) */}
        <button
            className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1"
            onClick={handleDuelStart}
            disabled={!isConnected}
        >
            <Users size={16} />
            유저 대결
        </button>
      </div>

      <div className="mt-6">
        {/* 싱글 플레이 전투 시작 버튼 */}
        <button
            className="w-full px-4 py-3 bg-red-600 text-white rounded hover:bg-red-700 font-bold flex items-center justify-center"
            onClick={() => {
              // 임시 전투 시작 로직 (몬스터 생성)
              setEnemy({
                name: '슬라임',
                level: 1,
                hp: 30,
                maxHp: 30,
                attack: 5,
                defense: 2,
                expReward: 10,
                goldReward: 5,
              });
              setBattleLog(['전투 시작!']);
              setTurn('player');
              setGameState('battle');
            }}
        >
            <Sword size={16} className="mr-2" /> 몬스터와 전투 시작 (싱글 플레이)
        </button>
      </div>
      
      {/* 클라우드 저장 버튼 */}
      <button 
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full flex items-center justify-center gap-2"
        onClick={saveToCloud}
      >
        <Save size={16} /> 클라우드 저장
      </button>

      <button
        className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 w-full"
        onClick={goToMainMenu}
      >
        메뉴로 돌아가기
      </button>
    </div>
  );
  
// ---------- 전투 화면 렌더링 ----------
  const renderBattleScreen = () => (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        ⚔️ 전투 중
      </h2>
      
      {/* 몬스터/상대방 상태 표시 */}
      {enemy && (
        <div className="p-4 bg-gray-100 shadow-lg rounded-lg mb-4 border border-gray-300">
          <h3 className="text-xl font-bold mb-2 text-gray-800">
            {enemy.name} (Lv.{enemy.level || 1})
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Heart size={16} className="text-red-500" />
              HP: <span className="font-semibold">{enemy.hp}/{enemy.maxHp || 1}</span>
            </div>
            <div className="w-full bg-gray-400 rounded-full h-2">
              <div 
                className="bg-red-500 h-2 rounded-full" 
                style={{ width: `${(enemy.hp / (enemy.maxHp || 1)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
      
      {/* 플레이어 상태 표시 */}
      {renderPlayerStatus()}

      {/* 전투 로그 */}
      <div className="border rounded p-3 bg-slate-900 text-slate-100 h-32 overflow-y-auto text-sm mb-4">
        {battleLog.map((log, idx) => (
          <div key={idx}>• {log}</div>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-2">
        <button
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 font-bold flex-1"
          onClick={handlePlayerAttack}
          disabled={turn !== 'player'}
        >
          공격 ({turn === 'player' ? '내 턴' : '상대 턴'})
        </button>
        {         <button 
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400 flex-1"
          onClick={() => setShowSkillMenu(true)}
          disabled={turn !== 'player'}
        >
          스킬
        </button>
        }
        <button 
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 flex-1"
          onClick={() => setShowInventoryInBattle(true)}
          disabled={turn !== 'player'}
        >
          아이템
        </button>
        
        {/* 듀얼 중에는 도망 불가 */}
        {multiplayerState !== 'in_duel' && (
          <button 
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 flex-1"
            onClick={() => endBattle('run')}
            disabled={turn !== 'player'}
          >
            도망
          </button>
        )}
      </div>

      {/* 전투 중 아이템 사용 팝업 (임시) */}
      {showInventoryInBattle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4">아이템 사용</h3>
            {player.inventory.filter(i => i.type === 'potion').map(item => (
                <div key={item.id} className="flex justify-between items-center py-1 border-b">
                    <span>{item.name} (x{item.count})</span>
                    <button 
                        className="text-sm text-blue-500 hover:text-blue-700 disabled:text-gray-400" 
                        onClick={() => handleUseItem(item)}
                        disabled={item.count === 0}
                    >
                        사용
                    </button>
                </div>
            ))}
            <button 
              className="mt-4 px-4 py-2 bg-gray-500 text-white rounded w-full" 
              onClick={() => setShowInventoryInBattle(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

    </div>
  );


// ---------- 인벤토리 화면 렌더링 ----------
const renderInventoryScreen = () => (
  <div className="p-4">
    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Package size={20} /> 인벤토리</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {/* 아이템 목록 */}
      <div className="border p-3 rounded bg-gray-50">
        <h3 className="text-lg font-semibold mb-2">아이템</h3>
        {player.inventory.length === 0 ? (
          <p className="text-gray-500">인벤토리가 비어 있습니다.</p>
        ) : (
          player.inventory.map(item => (
            <div key={item.id} className="flex justify-between items-center py-1 border-b">
              <span>**{item.name}** (x{item.count})</span>
              <div className="flex gap-2">
                <button 
                  className="text-sm text-blue-500 hover:text-blue-700 disabled:text-gray-400" 
                  onClick={() => handleUseItem(item)}
                  disabled={item.type !== 'potion'}
                >
                  사용
                </button>
                {item.type === 'weapon' || item.type === 'armor' ? (
                  <button
                    className="text-sm text-yellow-600 hover:text-yellow-700"
                    onClick={() => handleEquipItem(item)}
                  >
                    장착
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* 장비 창 */}
      <div className="border p-3 rounded bg-gray-50">
        <h3 className="text-lg font-semibold mb-2">장비</h3>
        <div className="space-y-2">
          <p>무기: **{player.equipment.weapon ? player.equipment.weapon.name : '없음'}** (ATK: {player.equipment.weapon ? player.equipment.weapon.attack : 0})</p>
          <p>방어구: **{player.equipment.armor ? player.equipment.armor.name : '없음'}** (DEF: {player.equipment.armor ? player.equipment.armor.defense : 0})</p>
        </div>
        <button
          className="mt-3 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          onClick={() => setShowEquipmentMenu(true)}
        >
          장비 상세 보기
        </button>
      </div>
    </div>
    <button
      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 w-full"
      onClick={() => setGameState('game')}
    >
      게임 화면으로 돌아가기
    </button>
  </div>
);


// ---------- 월드 지도 화면 렌더링 ----------
  const renderMapScreen = () => (
    <div>
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Map size={20} /> 월드 지도
      </h2>
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <p>현재 위치: **{player.location}**</p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className={`px-4 py-2 rounded text-white ${player.location === 'town' ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`}
          onClick={() => setPlayer((prev) => ({...prev, location: 'town'}))}
          disabled={player.location === 'town'}
        >
          마을 (Town)
        </button>
        <button
          className={`px-4 py-2 rounded text-white ${player.location === 'forest' ? 'bg-gray-400' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          onClick={() => setPlayer((prev) => ({...prev, location: 'forest'}))}
          disabled={player.location === 'forest'}
        >
          숲속 (Forest)
        </button>
      </div>

      <button
        className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 w-full"
        onClick={() => setGameState('game')}
      >
        게임 화면으로 돌아가기
      </button>
    </div>
  );


// ---------- 상점 화면 렌더링 ----------
const renderShopScreen = () => (
  <div className="p-4">
    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><ShoppingBag size={20} /> 상점</h2>
    <div className="flex border-b mb-4">
      <button 
        className={`p-2 ${shopTab === 'buy' ? 'border-b-2 border-blue-500 font-semibold' : 'text-gray-500'}`}
        onClick={() => setShopTab('buy')}
      >
        구매
      </button>
      <button 
        className={`p-2 ${shopTab === 'sell' ? 'border-b-2 border-blue-500 font-semibold' : 'text-gray-500'}`}
        onClick={() => setShopTab('sell')}
      >
        판매 (미구현)
      </button>
    </div>
    
    <p className="mb-4">💰 보유 골드: {player.gold}</p>
    
    {shopTab === 'buy' && (
      <div className="space-y-3">
        {shopItems.map((item) => (
          <div key={item.id} className="flex justify-between items-center p-2 border rounded bg-white">
            <span>
              **{item.name}** ({item.type === 'weapon' ? `공격 +${item.attack}` : item.type === 'armor' ? `방어 +${item.defense}` : item.type === 'potion' ? `${item.effect}` : ''})
              
            </span>
            <div className="flex items-center gap-2">
              <span className="text-yellow-600">💰 {item.price}</span>
              <button
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
                onClick={() => { /* 구매 로직은 별도 구현 필요 */ alert(`${item.name} 구매 로직 필요`); }}
                disabled={player.gold < item.price}
              >
                구매
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
    
    <button
      className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 w-full"
      onClick={() => setGameState('game')}
    >
      게임 화면으로 돌아가기
    </button>
  </div>
);


// ---------- 듀얼 로비 화면 렌더링 ----------
  const renderDuelLobby = () => (
    <div>
      {renderPlayerStatus()}

      <h2 className="text-2xl font-bold mb-4">
        ⚔️ 멀티플레이어 대결 로비
      </h2>

      <div className="border rounded p-4 mb-4 bg-yellow-50">
        {multiplayerState === 'searching' && (
          <p className="text-center font-semibold text-yellow-700">
            상대방을 찾고 있습니다... (서버 연결 대기)
          </p>
        )}
        {multiplayerState === 'ready' && opponent && (
          <div className="text-center font-semibold text-green-700">
            매칭 완료! 상대: **{opponent.name}** (Lv.{opponent.level})
          </div>
        )}
      </div>

      {multiplayerState === 'ready' && (
        <button
          className="w-full px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold mb-4"
          onClick={startDuel}
        >
          대결 시작 (Start Duel)
        </button>
      )}
      
      <div className="border rounded p-3 bg-slate-900 text-slate-100 h-32 overflow-y-auto text-sm">
        {duelLog.map((log, idx) => (
          <div key={idx}>• {log}</div>
        ))}
      </div>

      <button
        className="w-full mt-3 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        onClick={() => {
          setMultiplayerState('offline');
          setGameState('game');
          setDuelLog([]);
          socket.emit('leaveDuelQueue', currentUserId); // 서버에 대기열 이탈 알림
        }}
      >
        대결 취소 및 복귀
      </button>
    </div>
  );

// TurnBasedRPG 컴포넌트 내부, 다른 렌더링 함수들 옆에 추가

  const renderSkillMenu = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-sm">
        <h3 className="text-xl font-bold mb-4 flex justify-between items-center">
          스킬 목록
          <button onClick={() => setShowSkillMenu(false)}><X size={20} className="text-gray-600" /></button>
        </h3>
        {skills.map((skill) => (
          <div key={skill.id} className="flex justify-between items-center py-2 border-b">
            <div>
              **{skill.name}**
              <p className="text-xs text-gray-500">{skill.description}</p>
            </div>
            <button
              className="text-sm px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400"
              onClick={() => handlePlayerSkill(skill)}
              disabled={player.mp < skill.mpCost || turn !== 'player'}
            >
              사용 (MP {skill.mpCost})
            </button>
          </div>
        ))}
        <button 
          className="mt-4 px-4 py-2 bg-gray-500 text-white rounded w-full" 
          onClick={() => setShowSkillMenu(false)}
        >
          돌아가기
        </button>
      </div>
    </div>
  );

// ---------- 장비 상세 정보 (팝업) 렌더링 ----------
  const renderEquipmentMenu = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-lg shadow-2xl">
        <h3 className="text-2xl font-bold mb-4 flex justify-between items-center">
          장비 상세 정보
          <button onClick={() => setShowEquipmentMenu(false)}><X size={20} className="text-gray-600" /></button>
        </h3>
        
        <div className="space-y-4">
          <div className="p-3 border rounded">
            <p className="font-semibold">무기: {player.equipment.weapon?.name || '없음'}</p>
            <p className="text-sm">공격력 증가: +{player.equipment.weapon?.attack || 0}</p>
          </div>
          <div className="p-3 border rounded">
            <p className="font-semibold">방어구: {player.equipment.armor?.name || '없음'}</p>
            <p className="text-sm">방어력 증가: +{player.equipment.armor?.defense || 0}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-600">
          총 공격력: **{player.attack}** / 총 방어력: **{player.defense}**
        </p>
      </div>
    </div>
  );

// ---------- 레벨업 모달 렌더링 ----------
const renderLevelUpModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
        <div className="bg-white p-6 rounded-lg w-full max-w-sm text-center shadow-2xl">
            <ChevronsUp size={40} className="text-yellow-500 mx-auto mb-3" />
            <h3 className="text-2xl font-bold mb-2 text-green-700">레벨 업!</h3>
            <p className="text-4xl font-extrabold mb-4">Lv. {player.level}</p>
            <p className="text-sm text-gray-600 mb-4">
                기본 공격력, 방어력, 최대 HP/MP가 증가했습니다.
            </p>
            <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full"
                onClick={() => setShowLevelUpModal(false)}
            >
                확인
            </button>
        </div>
    </div>
);


  return (
    <div className="max-w-3xl mx-auto p-4 text-gray-900">
      {gameState === 'menu' && renderMenu()}
      {gameState === 'game' && renderGameScreen()}
      {gameState === 'battle' && renderBattleScreen()}
      {gameState === 'inventory' && renderInventoryScreen()}
      {gameState === 'shop' && renderShopScreen()}
      {gameState === 'map' && renderMapScreen()} 
      {gameState === 'duel_lobby' && renderDuelLobby()}

      {showEquipmentMenu && renderEquipmentMenu()}
      {showLevelUpModal && renderLevelUpModal()}
      {showSkillMenu && renderSkillMenu()}
    </div>
  );
};

export default TurnBasedRPG;
