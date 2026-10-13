const $ = (selector, root = document) => root.querySelector(selector);

const stages = [
  ["start", "开始"],
  ["brief", "Brief"],
  ["permission", "授权"],
  ["run", "执行"],
  ["result", "结果"],
];

const defaultPrompt = "读取本季度 CRM 与客服反馈，找出续费下降的主要原因，并生成一份给管理层的复盘报告";

const state = {
  stage: 0,
  prompt: "",
  attachment: "",
  connected: false,
  permissions: { crm: true, support: true, write: false },
  brief: {
    goal: "解释 Q3 企业客户续费率下降的关键原因",
    evidence: "企业版 CRM、客服工单与 NPS 反馈",
    deliverable: "一份管理层复盘报告，含结论、证据与建议",
    scope: "2026 Q3 · 企业客户 · 对比 Q2 与去年同期",
    boundary: "只读取数据；不联系客户、不修改 CRM 字段",
  },
  progress: 0,
  failed: false,
  reportTab: "report",
  runTimer: null,
};

const templates = {
  review: defaultPrompt,
  insight: "分析近 90 天客户反馈，找出最影响满意度的三个体验问题，并给出优先级建议",
  research: "扫描三家主要竞品最近一个季度的公开动态，输出功能、定价和定位差异",
};

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderStageStrip() {
  $("#stageStrip").innerHTML = stages.map(([key, label], index) => `
    <div class="stage-dot ${index < state.stage ? "done" : ""} ${index === state.stage ? "current" : ""}">
      <span>${label}</span>
    </div>`).join("");
}

function render() {
  clearInterval(state.runTimer);
  state.runTimer = null;
  renderStageStrip();
  const titles = ["新建任务", "任务 Brief", "计划与授权", "执行任务", "结果工作台"];
  $("#pageTitle").textContent = titles[state.stage];
  $("#modePill").textContent = state.stage === 0 ? "GUIDED" : state.stage === 4 ? "DELIVERED" : "IN PROGRESS";
  const view = $("#view");
  view.innerHTML = [renderHome, renderBrief, renderPermission, renderRun, renderResult][state.stage]();
  view.scrollTop = 0;
  if (state.stage === 3 && state.progress < 100 && !state.failed) startRun();
}

function renderHome() {
  return `<div class="page home-page center">
    <img class="home-mark" src="assets/vela-icon.png" alt="Vela 产品标志" />
    <span class="eyebrow">Your first delegation</span>
    <h1>今天想推进什么？</h1>
    <p class="page-lede">描述一个真实结果。Vela 会先整理计划、说明数据与权限，再开始执行。</p>
    <div class="composer">
      <textarea id="taskPrompt" aria-label="输入任务" placeholder="例如：${defaultPrompt}…">${escapeHtml(state.prompt)}</textarea>
      <div class="attachment-row">${state.attachment ? `<span class="attachment-chip">▱ ${escapeHtml(state.attachment)} · 已就绪</span>` : ""}</div>
      <div class="composer-tools">
        <button class="tool-btn" data-action="pickFile">＋ 添加资料</button>
        <button class="tool-btn ${state.connected ? "active" : ""}" data-action="connectData">⌁ ${state.connected ? "CRM 已连接" : "连接数据"}</button>
        <button class="tool-btn" data-action="applyTemplate" data-template="review">✦ 选择模板</button>
        <button class="send-btn" data-action="submitTask" aria-label="发送任务" ${state.prompt.trim() ? "" : "disabled"}>↑</button>
      </div>
    </div>
    <span class="privacy-note">第一次任务将使用引导模式 · 预计 3–5 分钟得到首个可用产物</span>
    <div class="template-wrap">
      <p class="template-label">从团队常见工作开始</p>
      <div class="template-grid">
        <button class="template-card" data-action="applyTemplate" data-template="review"><strong>经营复盘</strong><small>汇总指标、解释变化、生成管理层报告</small><i>↗</i></button>
        <button class="template-card" data-action="applyTemplate" data-template="insight"><strong>客户洞察</strong><small>整理访谈和工单，输出机会与行动建议</small><i>↗</i></button>
        <button class="template-card" data-action="applyTemplate" data-template="research"><strong>竞品研究</strong><small>搜索公开信息，形成证据化对照与结论</small><i>↗</i></button>
      </div>
    </div>
  </div>`;
}

function renderBrief() {
  return `<div class="page">
    <div class="section-heading">
      <div><span class="eyebrow">Agent reverse brief</span><h1>我先确认一下你的目标</h1><p>Vela 把模糊需求整理成可执行任务。你可以直接修改，确认后再授权数据与动作。</p></div>
      <span class="status-badge">已识别 5 项关键信息</span>
    </div>
    <div class="brief-layout">
      <div class="glass-card">
        <div class="card-head"><strong>任务 Brief</strong><span>所有字段都可编辑</span></div>
        <div class="brief-form">
          ${briefField("goal", "目标", "我最终要回答什么？")}
          ${briefField("evidence", "证据", "使用哪些数据？")}
          ${briefField("deliverable", "交付物", "最后得到什么？")}
          ${briefField("scope", "范围", "时间与人群边界")}
          <div class="field wide"><label for="brief-boundary">执行边界</label><textarea id="brief-boundary" data-brief="boundary">${escapeHtml(state.brief.boundary)}</textarea><small>涉及外发、删除、写入或付费的动作会在执行前单独确认。</small></div>
        </div>
      </div>
      <aside class="glass-card summary-card">
        <h3>Vela 的理解</h3>
        <p>这不是一次“给答案”的对话，而是一项有证据、有边界、可继续编辑的分析任务。</p>
        <ul class="summary-list">
          <li><b>01</b><span><strong>先查清变化</strong><small>对齐口径，定位续费率下滑发生在哪些客户段。</small></span></li>
          <li><b>02</b><span><strong>再解释原因</strong><small>把 CRM 结果与真实客服反馈交叉验证。</small></span></li>
          <li><b>03</b><span><strong>最后交付报告</strong><small>结论旁保留来源，可继续追问和修改。</small></span></li>
        </ul>
        <div class="action-row"><button class="btn ghost" data-action="prev">返回修改</button><button class="btn primary" data-action="confirmBrief">确认，查看计划 →</button></div>
      </aside>
    </div>
  </div>`;
}

function briefField(key, label, note) {
  return `<div class="field"><label for="brief-${key}">${label}</label><input id="brief-${key}" data-brief="${key}" value="${escapeHtml(state.brief[key])}" /><small>${note}</small></div>`;
}

function renderPermission() {
  return `<div class="page">
    <div class="section-heading">
      <div><span class="eyebrow">Plan & permission</span><h1>计划可见，权限分级</h1><p>先看清 Vela 准备怎么做。低风险读取按计划执行，高风险动作必须再次获得你的确认。</p></div>
      <span class="status-badge">预计 3 分钟</span>
    </div>
    <div class="permission-layout">
      <div class="glass-card plan-card">
        <div class="card-head"><strong>执行计划</strong><span>4 个步骤 · 2 个数据源</span></div>
        <div class="plan-steps">
          ${planStep("01", "校准指标口径", "检查续费率定义、时间窗口与有效样本", "低风险", "low")}
          ${planStep("02", "分析客户分层", "对比客户规模、行业、版本与使用深度", "低风险", "low")}
          ${planStep("03", "交叉验证反馈", "从工单与 NPS 原话提取主题，关联客户分层", "中风险", "medium")}
          ${planStep("04", "生成复盘报告", "形成结论、证据、建议与可编辑行动项", "可撤销", "low")}
        </div>
      </div>
      <aside class="glass-card permission-card">
        <h3>确认数据权限</h3>
        <p>仅在本任务中使用。Vela 不会写回数据，也不会代你联系客户。</p>
        ${sourceToggle("crm", "企业 CRM", "只读 · 客户信息与续费记录")}
        ${sourceToggle("support", "客服与 NPS", "只读 · 工单正文与评分")}
        ${sourceToggle("write", "写回 CRM", "高风险 · 当前计划不需要")}
        <div class="security-note">◈ 数据读取会记录在任务日志；敏感字段默认脱敏，任务结束后可撤销访问。</div>
        <button class="btn primary full" data-action="startExecution">授权并开始执行 →</button>
        <button class="btn ghost full" data-action="prev">返回调整 Brief</button>
      </aside>
    </div>
  </div>`;
}

function planStep(no, title, detail, risk, riskClass) {
  return `<div class="plan-step"><span class="step-no">${no}</span><span><strong>${title}</strong><small>${detail}</small></span><em class="risk ${riskClass}">${risk}</em></div>`;
}

function sourceToggle(key, title, detail) {
  return `<label class="source-toggle"><input type="checkbox" data-permission="${key}" ${state.permissions[key] ? "checked" : ""} /><span class="toggle-ui"></span><span><strong>${title}</strong><small>${detail}</small></span></label>`;
}

function renderRun() {
  const steps = [
    [15, "校准指标口径", "已验证 24,680 条续费记录", "34 秒"],
    [40, "分析客户分层", "正在对比规模、行业与使用深度", "58 秒"],
    [68, "交叉验证客户反馈", "正在聚合 1,284 条工单与 396 条 NPS", "1 分 06 秒"],
    [90, "生成管理层报告", "等待上一步证据完成", "约 42 秒"],
  ];
  return `<div class="page">
    <div class="section-heading">
      <div><span class="eyebrow">Traceable execution</span><h1>${state.failed ? "需要你做一个选择" : "任务正在执行"}</h1><p>${state.failed ? "原始数据源暂时不可用。已有结果不会丢失，你可以决定如何继续。" : "过程透明、证据可追溯。你可以离开此页面，任务会继续运行。"}</p></div>
      <span class="status-badge">${state.failed ? "等待确认" : "安全执行中"}</span>
    </div>
    <div class="run-layout">
      <div class="glass-card run-card">
        <div class="progress-top"><div><h2>Q3 续费下降复盘</h2><p>读取 CRM 与客户反馈 · 生成管理层报告</p></div><strong class="progress-value" id="progressValue">${state.progress}%</strong></div>
        <div class="progress-track"><div class="progress-bar" id="progressBar" style="width:${state.progress}%"></div></div>
        <div id="runSteps">${steps.map(([threshold,title,detail,time], i) => {
          const klass = state.progress >= threshold ? "done" : (state.progress >= (steps[i-1]?.[0] || 0) ? "active" : "");
          return `<div class="run-step ${klass}"><span class="run-icon">${klass === "done" ? "✓" : String(i+1).padStart(2,"0")}</span><span><strong>${title}</strong><small>${detail}</small></span><em>${klass === "done" ? time : klass === "active" ? "进行中" : "等待"}</em></div>`;
        }).join("")}</div>
        ${state.failed ? failurePanel() : `<div class="action-row"><button class="btn danger" data-action="simulateFailure">模拟数据源失败</button>${state.progress >= 100 ? `<button class="btn primary" data-action="openResult">查看结果 →</button>` : ""}</div>`}
      </div>
      <aside class="glass-card evidence-card">
        <h3>实时证据</h3><p>每条结论都可以回到原始数据。</p>
        <div class="evidence-item"><strong>续费口径已对齐</strong><small>CRM · subscription_status · 刚刚</small></div>
        <div class="evidence-item"><strong>中型客户下滑最明显</strong><small>企业 CRM · 分层分析 · -12.4%</small></div>
        <div class="evidence-item"><strong>工单主题正在聚合</strong><small>客服系统 · 1,284 条 · 进行中</small></div>
        <button class="btn ghost full" data-action="toast" data-message="执行日志已展开：所有访问均为只读">查看完整执行日志</button>
      </aside>
    </div>
  </div>`;
}

function failurePanel() {
  return `<div class="failure-panel"><h4>客服工单源连接超时</h4><p>已完成 CRM 分析，失败发生在读取客服正文时。你可以安全重试、改用 NPS 继续，或跳过本步骤；每种选择都会写入报告说明。</p><div class="failure-actions"><button data-action="recover" data-mode="retry">重试连接</button><button data-action="recover" data-mode="source">改用 NPS 继续</button><button data-action="recover" data-mode="skip">跳过并标注限制</button></div></div>`;
}

function renderResult() {
  return `<div class="page">
    <div class="section-heading">
      <div><span class="eyebrow">Artifact first</span><h1>首个任务已交付</h1><p>这是一份可检查、可编辑、可继续追问的工作产物，而不是一次性回答。</p></div>
      <span class="status-badge">已保存 · 证据完整</span>
    </div>
    <div class="result-layout">
      <article class="glass-card report-card">
        <div class="report-toolbar"><div class="tabs"><button class="tab ${state.reportTab === "report" ? "active" : ""}" data-action="tab" data-tab="report">报告</button><button class="tab ${state.reportTab === "data" ? "active" : ""}" data-action="tab" data-tab="data">数据</button><button class="tab ${state.reportTab === "actions" ? "active" : ""}" data-action="tab" data-tab="actions">行动项</button></div><button class="btn ghost" data-action="download">↓ 导出</button></div>
        <div class="report-body">${reportContent()}</div>
      </article>
      <div class="side-stack">
        <aside class="glass-card evidence-card">
          <h3>证据与来源</h3><p>点击可检查原始数据定位。</p>
          <div class="evidence-item"><strong><a class="source-link" href="#" data-action="source">CRM 客户分层表 ↗</a></strong><small>24,680 条记录 · 完整</small></div>
          <div class="evidence-item"><strong><a class="source-link" href="#" data-action="source">客服主题聚类 ↗</a></strong><small>1,284 条工单 · 完整</small></div>
          <div class="evidence-item"><strong><a class="source-link" href="#" data-action="source">NPS 原话与评分 ↗</a></strong><small>396 条反馈 · 完整</small></div>
        </aside>
        <aside class="glass-card result-actions">
          <h3>下一步</h3>
          <button class="btn full" data-action="saveTemplate">✦ 保存为团队模板</button>
          <button class="btn full" data-action="download">↓ 导出 Markdown 报告</button>
          <button class="btn full" data-action="reset">↻ 再运行一次</button>
          <div class="ask-box"><input id="followupInput" placeholder="继续追问这份结果…" aria-label="继续追问" /><button data-action="followup" aria-label="发送追问">↑</button></div>
        </aside>
      </div>
    </div>
  </div>`;
}

function reportContent() {
  if (state.reportTab === "data") return `<input class="report-title" value="关键数据对比" aria-label="页面标题" /><p class="report-meta">口径：企业客户 · 2026 Q3 对比 Q2 · 数据更新于刚刚</p><table class="data-table"><thead><tr><th>客户分层</th><th>Q2 续费率</th><th>Q3 续费率</th><th>变化</th></tr></thead><tbody><tr><td>大型企业</td><td>91.6%</td><td>89.8%</td><td>-1.8%</td></tr><tr><td>中型企业</td><td>87.3%</td><td>74.9%</td><td>-12.4%</td></tr><tr><td>成长企业</td><td>78.2%</td><td>73.6%</td><td>-4.6%</td></tr></tbody></table>`;
  if (state.reportTab === "actions") return `<input class="report-title" value="建议行动项" aria-label="页面标题" /><p class="report-meta">根据影响范围与实施成本排序 · 可直接勾选</p><div class="todo-list"><label class="todo"><input type="checkbox" />为中型企业客户补充批量权限配置向导，优先验证管理员角色。</label><label class="todo"><input type="checkbox" />在续费前 45 天自动识别“数据同步失败”高频客户并触发人工跟进。</label><label class="todo"><input type="checkbox" />将 API 限流说明与错误恢复入口合并进工作台，减少跨页面查找。</label></div>`;
  return `<input class="report-title" value="Q3 企业客户续费下降复盘" aria-label="报告标题" /><p class="report-meta">由 Vela 生成 · 3 个主要结论 · 9 条可追溯证据 · 可直接编辑</p><div class="metric-grid"><div class="metric"><small>Q3 企业续费率</small><strong>78.6%</strong><em>环比 -7.2%</em></div><div class="metric"><small>主要影响客群</small><strong>中型企业</strong><em>下降 12.4%</em></div><div class="metric"><small>高频阻力主题</small><strong>权限配置</strong><em>占流失反馈 31%</em></div></div><div class="insight"><span class="insight-label">01</span><strong>下滑集中在首次扩容后的中型企业，而非所有客群</strong><p>该客群在扩容后 30 天内出现更多权限配置与数据同步工单；续费率比其他企业客户低 10.8 个百分点。</p></div><div class="insight"><span class="insight-label">02</span><strong>“配置复杂”比价格更能解释本季度变化</strong><p>流失客户的工单中，权限、API 与同步问题占 47%；价格相关反馈占 18%，且与上季度基本持平。</p></div><div class="insight"><span class="insight-label">03</span><strong>建议优先修复扩容后的 30 天体验</strong><p>把管理员配置向导、失败恢复和主动预警集中到同一链路，预计能覆盖最集中的流失风险。</p></div>`;
}

function startRun() {
  state.runTimer = setInterval(() => {
    if (state.failed) return;
    state.progress = Math.min(100, state.progress + (state.progress < 70 ? 4 : 3));
    const bar = $("#progressBar");
    const value = $("#progressValue");
    if (bar) bar.style.width = `${state.progress}%`;
    if (value) value.textContent = `${state.progress}%`;
    updateRunSteps();
    if (state.progress >= 100) {
      clearInterval(state.runTimer);
      state.runTimer = null;
      render();
      showToast("首个可用产物已生成，可以开始审阅");
    }
  }, 700);
}

function updateRunSteps() {
  const thresholds = [15,40,68,90];
  const rows = document.querySelectorAll(".run-step");
  rows.forEach((row, i) => {
    row.classList.toggle("done", state.progress >= thresholds[i]);
    row.classList.toggle("active", state.progress < thresholds[i] && state.progress >= (thresholds[i-1] || 0));
    const icon = $(".run-icon", row);
    const status = $("em", row);
    if (state.progress >= thresholds[i]) { icon.textContent = "✓"; status.textContent = ["34 秒","58 秒","1 分 06 秒","42 秒"][i]; }
    else if (state.progress >= (thresholds[i-1] || 0)) status.textContent = "进行中";
    else status.textContent = "等待";
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openModal(title, content) {
  $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-action="closeModal"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}" onclick="event.stopPropagation()"><div class="modal-head"><h2>${title}</h2><button class="modal-close" data-action="closeModal" aria-label="关闭">×</button></div><div class="modal-body">${content}</div></section></div>`;
}

function flowModal() {
  return `<p>从“说出结果”到“审阅产物”的完整首任务闭环。分支会在失败或高风险动作发生时出现。</p><div class="flow-map">${[
    ["01","描述真实目标","自然语言 / 模板 / 连接数据"],
    ["02","Agent 反向 Brief","目标、证据、交付物、边界"],
    ["03","确认计划与权限","只读数据按源授权"],
    ["04","执行与进度","步骤、证据、预计完成时间"],
    ["05","失败恢复","重试 / 换源 / 跳过并标注"],
    ["06","结果工作台","审阅、编辑、追问、导出、复用"],
  ].map((n,i) => `<div class="flow-node"><b>${n[0]}</b><span><strong>${n[1]}</strong><small>${n[2]}</small></span><i>${i < 5 ? "↓" : "✓"}</i></div>`).join("")}</div>`;
}

document.addEventListener("input", (event) => {
  if (event.target.id === "taskPrompt") {
    state.prompt = event.target.value;
    const btn = $(".send-btn");
    if (btn) btn.disabled = !state.prompt.trim();
  }
  if (event.target.dataset.brief) state.brief[event.target.dataset.brief] = event.target.value;
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.permission) state.permissions[event.target.dataset.permission] = event.target.checked;
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && state.stage === 0 && state.prompt.trim()) {
    event.preventDefault(); state.stage = 1; render();
  }
  if (event.key === "Escape") $("#modalRoot").innerHTML = "";
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "reset") { state.stage = 0; state.prompt = ""; state.progress = 0; state.failed = false; state.reportTab = "report"; render(); }
  if (action === "toast") showToast(target.dataset.message);
  if (action === "toggleSidebar") $("#sidebar").classList.toggle("open");
  if (action === "pickFile") $("#fileInput").click();
  if (action === "connectData") { state.connected = !state.connected; render(); showToast(state.connected ? "企业 CRM 已安全连接" : "已断开 CRM"); }
  if (action === "applyTemplate") { state.prompt = templates[target.dataset.template]; render(); setTimeout(() => { const p = $("#taskPrompt"); p?.focus(); p?.setSelectionRange(p.value.length,p.value.length); }, 0); }
  if (action === "submitTask") { if (!state.prompt.trim()) return; state.stage = 1; render(); }
  if (action === "prev") { state.stage = Math.max(0, state.stage - 1); render(); }
  if (action === "confirmBrief") { state.stage = 2; render(); }
  if (action === "startExecution") {
    if (!state.permissions.crm) { showToast("请至少授权企业 CRM，才能完成本次分析"); return; }
    state.stage = 3; state.progress = 6; state.failed = false; render();
  }
  if (action === "simulateFailure") { state.failed = true; state.progress = Math.max(48, state.progress); render(); }
  if (action === "recover") { state.failed = false; showToast(target.dataset.mode === "retry" ? "连接已恢复，继续执行" : target.dataset.mode === "source" ? "已切换为 NPS 数据源" : "已跳过并记录限制"); render(); }
  if (action === "openResult") { state.stage = 4; render(); }
  if (action === "tab") { state.reportTab = target.dataset.tab; render(); }
  if (action === "download") downloadReport();
  if (action === "saveTemplate") showToast("已保存为「Q3 续费复盘」团队模板");
  if (action === "followup") { const input = $("#followupInput"); if (input?.value.trim()) { showToast("追问已加入任务，Vela 正在补充报告"); input.value = ""; } }
  if (action === "source") { event.preventDefault(); showToast("已定位到脱敏后的原始证据"); }
  if (action === "openFlow") openModal("完整交互链路", flowModal());
  if (action === "openAbout") openModal("关于这个 Demo", `<p><strong>Vela · AI Agent Onboarding</strong></p><p>火山引擎产品设计师测试题，高保真交互 Demo。设计与制作：<strong>吴瑜英 · WUYUYING</strong>。</p><p>核心目标：让第一次真实委派变得可理解、可授权、可追踪、可恢复、可交付。</p>`);
  if (action === "closeModal") $("#modalRoot").innerHTML = "";
});

$("#fileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.attachment = file.name;
  render();
  showToast("资料已添加，仅用于本次任务");
});

function downloadReport() {
  const report = `# Q3 企业客户续费下降复盘\n\n生成：Vela AI Agent\n候选人：吴瑜英 WUYUYING\n\n## 核心结论\n\n1. 下滑集中在首次扩容后的中型企业。\n2. 配置复杂比价格更能解释本季度变化。\n3. 建议优先修复扩容后的 30 天体验。\n\n## 证据\n\n- 企业 CRM：24,680 条记录\n- 客服系统：1,284 条工单\n- NPS：396 条反馈\n`;
  const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "Vela_Q3续费下降复盘.md"; anchor.click();
  URL.revokeObjectURL(url); showToast("报告已导出");
}

render();
