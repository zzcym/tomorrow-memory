"""训练环境自检：python training/check_env.py"""

import sys


def main() -> int:
    # Windows 管道里 stdout 默认是 cp936，中文会乱码；统一成 utf-8
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    print(f"python       {sys.version.split()[0]}  ({sys.executable})")

    try:
        import torch
    except Exception as e:  # noqa: BLE001
        print(f"torch        FAIL: {e}")
        return 1

    print(f"torch        {torch.__version__}")
    cuda = torch.cuda.is_available()
    print(f"cuda         {cuda}")
    if not cuda:
        print("             没有可用 GPU —— 检查驱动，或装成了 CPU 版 torch")
        return 1

    name = torch.cuda.get_device_name(0)
    total = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"gpu          {name}  ({total:.1f} GB)")
    print(f"bf16         {torch.cuda.is_bf16_supported()}")

    for mod in ("transformers", "peft", "trl", "bitsandbytes", "datasets", "accelerate"):
        try:
            m = __import__(mod)
            print(f"{mod:<12} {getattr(m, '__version__', '?')}")
        except Exception as e:  # noqa: BLE001
            print(f"{mod:<12} FAIL: {e}")
            return 1

    # 4B 模型 QLoRA 的粗略显存估算（权重 + LoRA + 激活 + 碎片）
    weights_4bit = 4.0e9 * 0.55 / 1024**3
    print(f"\n4B QLoRA 权重约 {weights_4bit:.1f} GB，加上激活/优化器/碎片，seq=2048 实需 ~6 GB")
    print(f"结论：{'本地 8G 卡可以跑 QLoRA SFT' if total >= 7 else '显存不足 7G，建议租卡'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
