@echo off
rem ===== DSH 手机远程访问隧道（开机自启） =====
rem 作用：把本机 DSH（127.0.0.1:3080）通过阿里云服务器反向隧道暴露为 https://dsh.tmword.xyz
rem 断线自动重连；最小化窗口运行。
rem 用法：复制到任意目录（如 D:\dsh-tunnel.bat），配置开机自启后双击/自动运行。

title DSH Tunnel (dsh.tmword.xyz)

:loop
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N -R 3080:127.0.0.1:3080 root@106.15.0.124
echo [%date% %time%] Tunnel disconnected, retrying in 5s...
timeout /t 5 /nobreak >nul
goto loop
