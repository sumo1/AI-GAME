/*
 * @since: 2025/8/28
 * @author: sumo
 * @description: 优化的游戏容器组件，提供自适应和美观的UI
 */
import React, { useEffect, useRef, useState } from 'react'
import { Card, message, Spin, Typography, Space, Tag, Button, Tooltip, Popover, Alert } from 'antd'
import { 
  ReloadOutlined, 
  FullscreenOutlined, 
  FullscreenExitOutlined, 
  PlayCircleOutlined,
  PauseCircleOutlined,
  SoundOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import './GameContainer.css'

const { Title, Text } = Typography

interface GameContainerProps {
  gameData: any
  onRestart?: () => void
}

const GameContainer: React.FC<GameContainerProps> = ({ gameData, onRestart }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [gameStatus, setGameStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('empty')
  const [gameScore, setGameScore] = useState({ correct: 0, wrong: 0, progress: 0 })
  const [suggestions, setSuggestions] = useState<{ level: 'info'|'warning'|'error'; text: string }[]>([])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // 加载游戏内容
  useEffect(() => {
    if (gameData?.html) {
      setIsLoading(true)
      setGameStatus('loading')
      
      // 处理游戏HTML，注入消息通信和自适应代码
      const enhancedHtml = injectGameEnhancements(gameData.html)
      // 自动分析改进建议（无需按钮触发）
      setSuggestions(analyzeGameHtml(gameData.html))
      
      // 使用srcdoc加载内容，避免弹窗问题
      if (iframeRef.current) {
        iframeRef.current.srcdoc = enhancedHtml
        
        // 监听iframe加载完成
        iframeRef.current.onload = () => {
          setIsLoading(false)
          setGameStatus('ready')
          setupMessageChannel()
        }
      }
    } else {
      setGameStatus('empty')
    }
  }, [gameData])

  // 基于静态规则的轻量建议生成
  const analyzeGameHtml = (html: string) => {
    const s: { level: 'info'|'warning'|'error'; text: string }[] = []
    const lower = html.toLowerCase()

    // 1) 说明与控件一致性
    const mentionsButtons = /左右按钮|点击左右|按下左右|left\s*button|right\s*button/i.test(html)
    const hasLeftRightButtons = /<button[^>]*>[^<]*左|<button[^>]*>[^<]*右/i.test(html)
    if (mentionsButtons && !hasLeftRightButtons) {
      s.push({ level: 'warning', text: '说明提到“左右按钮”，但页面未检测到对应的可点击按钮。建议补充可视化的左/右按钮，并保留键盘方向键支持。' })
    }

    // 2) 键盘方向键支持
    const hasArrowKeys = /ArrowLeft|ArrowRight/.test(html)
    if (!hasArrowKeys) {
      s.push({ level: 'info', text: '未检测到键盘方向键(ArrowLeft/ArrowRight)事件，建议同时支持键盘操作以提升可玩性。' })
    }

    // 3) 碰撞检测方式
    const usesAABB = /getBoundingClientRect\(\)/.test(html) && /(left|right|top|bottom)/i.test(html)
    const usesDistance = /Math\.abs\([^)]*\)\s*<\s*\d+/.test(html)
    if (!usesAABB && usesDistance) {
      s.push({ level: 'warning', text: '碰撞检测疑似使用固定距离阈值。建议改为轴对齐矩形相交（AABB）以获得更稳定的判定。' })
    }

    // 4) 尺寸比例与容器
    const setsBodyLayout = /body\s*\{[^}]*?(display\s*:\s*flex|overflow\s*:\s*hidden)/i.test(html)
    if (setsBodyLayout) {
      s.push({ level: 'info', text: '检测到对 <body> 设置了全局布局（flex/overflow）。建议将布局限制在游戏容器内（如 .game-area/#game-container），避免影响宿主页面。' })
    }

    // 5) 统一尺寸提示
    const hasGameArea = /(class=\"game-area\")|(id=\"game-container\")/i.test(html)
    if (!hasGameArea) {
      s.push({ level: 'info', text: '未检测到标准的游戏容器(.game-area 或 #game-container)。建议添加统一容器，便于自适应与样式隔离。' })
    }

    // 6) 元信息与编码
    if (!/charset=.*utf-8/i.test(html)) {
      s.push({ level: 'warning', text: '未检测到 UTF-8 编码声明，建议在 <head> 中加入 <meta charset="UTF-8">。' })
    }

    return s
  }

  // 注入游戏增强代码
  const injectGameEnhancements = (html: string) => {
    // 添加自适应和消息通信代码
    const enhancements = `
      <script>
        // 替换alert为自定义提示
        window.alert = function(msg) {
          window.parent.postMessage({
            type: 'game-alert',
            message: msg
          }, '*');
        };
        
        // 替换confirm为自定义确认
        window.confirm = function(msg) {
          window.parent.postMessage({
            type: 'game-confirm',
            message: msg
          }, '*');
          return true; // 默认确认
        };
        
        // 发送游戏状态
        function sendGameStatus(status, data) {
          window.parent.postMessage({
            type: 'game-status',
            status: status,
            data: data
          }, '*');
        }
        
        // 选择游戏根节点：优先常见选择器，其次选择 body 下面积最大的元素
        function pickGameRoot() {
          const prefer = document.querySelector('#game-container, .game-area, .game-root, .game, .stage');
          if (prefer) return prefer;
          const nodes = Array.from(document.body.querySelectorAll('*')) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestArea = 0;
          for (const el of nodes) {
            if (!el.offsetWidth || !el.offsetHeight) continue;
            const style = getComputedStyle(el);
            if (style.position === 'fixed' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
            const area = el.offsetWidth * el.offsetHeight;
            if (area > bestArea) { bestArea = area; best = el; }
          }
          return best || document.body.firstElementChild as HTMLElement | null;
        }

        // 自适应处理：尽量填满可视区域（不使用 transform，避免布局错位）
        function handleResize() {
          const root = pickGameRoot();
          if (!root) return;
          const vw = Math.max(320, Math.floor(window.innerWidth * 0.92));
          const vh = Math.max(320, Math.floor(window.innerHeight * 0.88));

          // 通用容器限制
          root.style.maxWidth = vw + 'px';
          root.style.maxHeight = vh + 'px';
          root.style.margin = '0 auto';
          root.style.display = 'block';
          root.style.transform = '';
          (root as any).style?.removeProperty?.('transform');

          // 针对 Canvas 的等比缩放
          const canvas = (root.tagName === 'CANVAS') ? root as HTMLCanvasElement : (document.querySelector('canvas') as HTMLCanvasElement | null);
          if (canvas) {
            try {
              const cw = canvas.width || canvas.getAttribute('width') || 800;
              const ch = canvas.height || canvas.getAttribute('height') || 600;
              const ratio = Number(cw) / Number(ch);
              const targetWidth = Math.min(vw, Math.round(vh * ratio));
              const targetHeight = Math.round(Number(targetWidth) / ratio);
              canvas.style.width = String(targetWidth) + 'px';
              canvas.style.height = String(targetHeight) + 'px';
              canvas.style.display = 'block';
              canvas.style.margin = '0 auto';
            } catch (e) { /* 忽略 */ }
          } else {
            // 非 canvas：尽量保持等比，避免高度溢出
            const rw = root.scrollWidth || root.clientWidth || 800;
            const rh = root.scrollHeight || root.clientHeight || 600;
            const r = rw / (rh || 1);
            const w = Math.min(vw, Math.round(vh * r));
            root.style.width = w + 'px';
          }
        }
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        window.addEventListener('load', handleResize);
        
        // 监听得分变化
        document.addEventListener('DOMContentLoaded', function() {
          // 尝试获取游戏分数元素
          const observer = new MutationObserver(function() {
            const scoreElement = document.querySelector('[class*="score"], [id*="score"]');
            if (scoreElement) {
              sendGameStatus('score-update', { score: scoreElement.textContent });
            }
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
          setTimeout(handleResize, 50);
          const ro = new ResizeObserver(() => handleResize());
          ro.observe(document.body);
        });
      </script>
      <style>
        /* 避免全局覆盖 body 布局，仅做基础重置与背景 */
        html, body {
          margin: 0;
          padding: 0;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        /* 将布局限制在游戏容器内 */
        .game-area, #game-container, .container {
          max-width: 100% !important;
          max-height: 100vh !important;
          margin: 0 auto !important;
        }
        
        /* 响应式Canvas */
        canvas {
          max-width: 100% !important;
          height: auto !important;
        }
      </style>
    `
    
    // 在</head>前插入增强代码
    if (html.includes('</head>')) {
      return html.replace('</head>', enhancements + '</head>')
    } else if (html.includes('<body>')) {
      return html.replace('<body>', '<head>' + enhancements + '</head><body>')
    }
    
    return enhancements + html
  }

  // 设置消息通道
  const setupMessageChannel = () => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'game-alert') {
        // 使用Ant Design的message替代alert
        message.info(event.data.message)
      } else if (event.data?.type === 'game-confirm') {
        // 使用Ant Design的message替代confirm
        message.warning(event.data.message)
      } else if (event.data?.type === 'game-status') {
        // 处理游戏状态更新
        if (event.data.status === 'score-update') {
          handleScoreUpdate(event.data.data)
        }
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }

  // 处理分数更新
  const handleScoreUpdate = (data: any) => {
    // 解析分数数据
    if (data?.score) {
      const scoreText = data.score.toString()
      const correctMatch = scoreText.match(/正确[:\s]*(\d+)/i)
      const wrongMatch = scoreText.match(/错误[:\s]*(\d+)/i)
      const progressMatch = scoreText.match(/进度[:\s]*(\d+)/i)
      
      setGameScore({
        correct: correctMatch ? parseInt(correctMatch[1]) : gameScore.correct,
        wrong: wrongMatch ? parseInt(wrongMatch[1]) : gameScore.wrong,
        progress: progressMatch ? parseInt(progressMatch[1]) : gameScore.progress
      })
    }
  }

  // 刷新游戏
  const handleRefresh = () => {
    if (iframeRef.current && gameData?.html) {
      setIsLoading(true)
      const enhancedHtml = injectGameEnhancements(gameData.html)
      iframeRef.current.srcdoc = enhancedHtml
    }
  }

  // 全屏切换
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // 导出HTML
  const handleExport = () => {
    if (gameData?.html) {
      const blob = new Blob([gameData.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${gameData.gameData?.title || '游戏'}.html`
      a.click()
      URL.revokeObjectURL(url)
      message.success('游戏已导出')
    }
  }

  // 获取游戏信息
  const gameInfo = gameData?.gameData || {}
  const isAIGenerated = gameInfo.generated === true

  return (
    <div className="game-container" ref={containerRef}>
      <Card
        className="game-card"
        title={
          <div className="game-header">
            <Title level={4} className="game-title">
              🎮 {gameInfo.title || '游戏加载中'}
            </Title>
            <div className="game-meta">
              <Space>
                {isAIGenerated && (
                  <Tag color="purple" icon={<CheckCircleOutlined />}>
                    AI生成
                  </Tag>
                )}
                {gameInfo.type && (
                  <Tag color="blue">{gameInfo.type}</Tag>
                )}
                {gameStatus === 'ready' && (
                  <Tag color="green" icon={<PlayCircleOutlined />}>
                    就绪
                  </Tag>
                )}
              </Space>
            </div>
          </div>
        }
        extra={
          <Space className="game-controls">
            {/* 分数显示 */}
            {(gameScore.correct > 0 || gameScore.wrong > 0) && (
              <div className="score-display">
                <Space>
                  <Tag color="green">✓ 正确: {gameScore.correct}</Tag>
                  <Tag color="red">✗ 错误: {gameScore.wrong}</Tag>
                  <Tag color="blue">📊 进度: {gameScore.progress}/10</Tag>
                </Space>
              </div>
            )}
            
            {/* 控制按钮 */}
            <Tooltip title="刷新游戏">
              <Button 
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={isLoading}
              />
            </Tooltip>
            
            <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
              <Button 
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
              />
            </Tooltip>
            
            <Tooltip title="导出HTML">
              <Button 
                icon={<CodeOutlined />}
                onClick={handleExport}
                type="primary"
              />
            </Tooltip>

            {/* 改进建议（不显眼的小入口） */}
            {suggestions.length > 0 && (
              <Popover
                placement="bottomRight"
                content={
                  <Space direction="vertical" style={{ maxWidth: 360 }}>
                    {suggestions.map((sg, idx) => (
                      <Alert key={idx} type={sg.level === 'error' ? 'error' : sg.level === 'warning' ? 'warning' : 'info'} showIcon message={sg.text} />
                    ))}
                  </Space>
                }
                trigger="click"
              >
                <Button size="small" type="text">改进建议（{suggestions.length}）</Button>
              </Popover>
            )}
          </Space>
        }
      >
        <div className="game-content">
          {/* 建议入口已移到头部控件区域，避免抢占视线 */}
          {gameStatus === 'empty' && (
            <div className="game-empty">
              <Title level={3}>🎮 奇妙游戏世界</Title>
              <Text type="secondary">欢迎来到贪吃蛇冒险之旅！吃苹果，别撞墙或撞自己哦！</Text>
              <Button 
                type="primary" 
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={onRestart}
                style={{ marginTop: 20 }}
              >
                开始游戏
              </Button>
            </div>
          )}
          
          {gameStatus === 'loading' && (
            <div className="game-loading">
              <Spin size="large" tip="游戏加载中..." />
            </div>
          )}
          
          {gameData?.html && (
            <div className="game-iframe-wrapper">
              <iframe
                ref={iframeRef}
                className="game-iframe"
                title="Game"
                sandbox="allow-scripts allow-same-origin allow-forms"
                style={{ 
                  display: isLoading ? 'none' : 'block'
                }}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default GameContainer
