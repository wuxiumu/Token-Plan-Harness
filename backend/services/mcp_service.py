"""百炼 Harness / MCP 服务测试中心

服务注册表 + 各服务调用封装（通过 bailian CLI `bl` 驱动）。
supported=False 的服务在列表页展示为「接入中」，点击提示暂不可测。
"""
import time

from ..adapters.bailian_cli import _run
from . import mcp_log_service

# 服务注册表（描述/价格/权益额度取自百炼控制台）
SERVICES = [
    {
        "id": "image", "name": "图像生成 MCP", "badge": "CLI",
        "desc": "擅长复杂文本渲染、图文混合布局与真实质感表现。支持图像创作、局部元素编辑、风格转换、多图融合、视频首帧生成、参考生图等。单次最多 6 张、最高 2048×2048。",
        "price": "¥0.24/张（后付费）", "quota": "权益额度 0/20 张 (0%)",
        "model_default": "wan2.7-image", "models": ["wan2.7-image", "qwen-image-3.0", "wanx-v1"],
        "supported": True,
    },
    {
        "id": "video", "name": "视频生成 MCP", "badge": "CLI",
        "desc": "文生视频、图生视频与视频编辑全流程。文生视频支持 9 种宽高比、最高 1080P、时长最多 15s；图生视频以首帧结合文本引导；支持风格变换、局部替换、内容修改。",
        "price": "88 折生效中", "quota": "按生成量计费",
        "model_default": "wan3.0-video",
        "models": ["wan3.0-video", "wan2.6-t2v", "happyhorse-1.1-i2v"],
        "supported": True,
    },
    {
        "id": "code", "name": "代码解释器 MCP", "badge": "MCP",
        "desc": "部署在云上沙盒中安全执行代码，防止恶意操作影响系统。",
        "price": "¥0.05/次（后付费）", "quota": "权益额度 0/100 次 (0%)",
        "supported": False,
    },
    {
        "id": "web_search", "name": "联网搜索增强版 MCP", "badge": "CLI",
        "desc": "提供高质量、兼具时效性与权威性的高可信信息源，为 Agent 提供实时联网能力。",
        "price": "¥0.03/次（后付费）", "quota": "权益额度 0/100 次 (0%)",
        "supported": True,
    },
    {
        "id": "web_parser", "name": "网页解析 MCP", "badge": "MCP",
        "desc": "通过网页地址获取完整内容（markdown），或获取子链接探索下一级网页。",
        "price": "¥0.002/次（后付费）", "quota": "权益额度 0/1000 次 (0%)",
        "supported": False,
    },
    {
        "id": "vertical_search", "name": "垂类搜索 MCP", "badge": "MCP",
        "desc": "面向大模型应用，提供结构化位置数据查询和洞察，满足基于位置的问答及医疗问答需求。",
        "price": "¥0.03/次（后付费）", "quota": "权益额度 0/100 次 (0%)",
        "supported": False,
    },
    {
        "id": "tts", "name": "语音合成 MCP", "badge": "MCP",
        "desc": "多种拟人音色，支持多语言及方言，系统可自适应语气，流畅处理复杂文本。",
        "price": "¥1.2/万字符（后付费）", "quota": "权益额度 0/10000 字符 (0%)",
        "supported": False,
    },
    {
        "id": "asr", "name": "语音识别 MCP", "badge": "MCP",
        "desc": "录音文件识别服务，支持中文、英文、日语、韩语等。",
        "price": "88 折生效中", "quota": "权益额度 0/18000 秒 (0%)",
        "supported": False,
    },
    {
        "id": "rag", "name": "RAG 知识库服务", "badge": "CLI",
        "desc": "上传文档自动完成解析、切片、向量化与索引，通过 API 提供检索与流式问答，连接私有知识与前沿大模型。",
        "price": "规格费用 · 88 折生效中", "quota": "按规格计费",
        "supported": True,
    },
    {
        "id": "memory", "name": "Memory 记忆库服务", "badge": "CLI",
        "desc": "为智能体提供跨会话长期记忆的托管服务，通过 API 写入、检索与管理记忆。",
        "price": "88 折生效中", "quota": "按使用计费",
        "supported": True,
    },
    {
        "id": "agent", "name": "Managed Agent 托管智能体", "badge": "CLI",
        "desc": "百炼智能体托管运行时，适用于多步工具调用、代码执行、文件处理等长时任务。平台托管会话状态、沙盒与工具执行。",
        "price": "会话运行时费 · 88 折生效中", "quota": "按会话计费",
        "supported": False,
    },
    {
        "id": "sandbox", "name": "Sandbox 安全沙箱服务", "badge": "API",
        "desc": "云端安全沙箱，为 AI 智能体提供隔离的代码执行、浏览器操作与文件处理环境，兼容 E2B SDK/API 协议。",
        "price": "88 折生效中", "quota": "按使用计费",
        "supported": False,
    },
]

_SERVICE_INDEX = {s["id"]: s for s in SERVICES}


def list_services():
    return SERVICES


def _bl(*args):
    return _run(list(args))


def _ensure(p, key, default=""):
    v = p.get(key)
    return v if v not in (None, "", "undefined") else default


def call_image(params):
    args = ["image", "generate", "--prompt", _ensure(params, "prompt")]
    m = _ensure(params, "model", "wan2.7-image")
    args += ["--model", m]
    s = _ensure(params, "size")
    if s:
        args += ["--size", s]
    n = params.get("n")
    if n:
        args += ["--n", str(n)]
    return _bl(*args)


def call_video(params):
    args = ["video", "generate", "--prompt", _ensure(params, "prompt")]
    m = _ensure(params, "model", "wan3.0-video")
    args += ["--model", m]
    img = params.get("image")
    if img:
        args += ["--image", img]
    r = _ensure(params, "ratio")
    if r:
        args += ["--ratio", r]
    dur = params.get("duration")
    if dur:
        args += ["--duration", str(dur)]
    res = _ensure(params, "resolution")
    if res:
        args += ["--resolution", res]
    return _bl(*args)


def call_search(params):
    # 当前活跃 profile 是 token-plan，其 key 不授权 `bl search web`(MCP 通道)，
    # 官方正确路径：model-native 联网搜索（Responses API + web_search 工具），已实测可用。
    args = [
        "text", "chat", "--api", "responses",
        "--tool", '{"type":"web_search"}',
        "--message", _ensure(params, "query"),
    ]
    data = _bl(*args)
    # 从 Responses 结构提取可读文本
    if isinstance(data, dict) and isinstance(data.get("output"), list):
        texts = []
        for o in data["output"]:
            content = o.get("content") or []
            if isinstance(content, list):
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "output_text" and c.get("text"):
                        texts.append(c["text"])
        if texts:
            data["content"] = "\n\n".join(texts)
    return data


def call_knowledge(params):
    # 官方用法：bl knowledge chat --message <text> --agent-id <id>（--agent-id 必填）
    args = ["knowledge", "chat", "--message", _ensure(params, "query")]
    kb = params.get("knowledge_base_id")
    if kb:
        args += ["--agent-id", kb]
    return _bl(*args)


def call_memory(params):
    # 官方用法：bl memory search --user-id <id> --query <text>（--user-id 必填；workspace 取自 BAILIAN_WORKSPACE_ID）
    args = ["memory", "search", "--user-id", params.get("user_id") or "default_user"]
    q = _ensure(params, "query")
    if q:
        args += ["--query", q]
    return _bl(*args)


_CALLERS = {
    "image": call_image,
    "video": call_video,
    "web_search": call_search,
    "rag": call_knowledge,
    "memory": call_memory,
}


def call(service_id: str, params: dict):
    meta = _SERVICE_INDEX.get(service_id)
    if not meta:
        return {"error": f"未知服务 {service_id}"}
    if not meta.get("supported"):
        return {"error": "该服务尚未接入测试", "supported": False}
    fn = _CALLERS.get(service_id)
    if not fn:
        return {"error": "该服务尚未接入调用"}
    t0 = time.time()
    try:
        res = fn(params or {})
        ok = not (isinstance(res, dict) and res.get("error"))
    except Exception as e:  # noqa: BLE001
        res = {"error": str(e)}
        ok = False
    elapsed = (time.time() - t0) * 1000
    try:
        mcp_log_service.add_log(meta["id"], meta["name"], params or {}, res, elapsed, ok)
    except Exception:  # noqa: BLE001  日志失败不影响主流程
        pass
    return res
