async function getDb() {
  if (window._db) return window._db;
  const app = cloudbase.init({
    env: window.APP_CONFIG.envId,
    accessKey: window.APP_CONFIG.accessKey
  });
  window._db = app.database();
  return window._db;
}
function $(id){return document.getElementById(id)}
function showMsg(id,msg){ const el=$(id); if(el) el.textContent=msg; }
function setStoredUser(user){ localStorage.setItem("demo_user", JSON.stringify(user)); }
function getStoredUser(){ try{return JSON.parse(localStorage.getItem("demo_user")||"null")}catch{return null} }
function logout(){ localStorage.removeItem("demo_user"); window.location.href="login.html"; }
function money(n){ return "¥" + Number(n||0).toFixed(2); }

async function login() {
  showMsg("loginMsg","");
  const username = $("username").value.trim();
  const password = $("password").value.trim();
  if(!username || !password){ showMsg("loginMsg","请输入账号和密码"); return; }
  try{
    const db = await getDb();
    const res = await db.collection("users").where({username,password}).get();
    if(!res.data.length){ showMsg("loginMsg","账号或密码错误"); return; }
    const user = res.data[0];
    setStoredUser(user);
    window.location.href = user.role === "admin" ? "admin.html" : "user.html";
  }catch(e){ console.error(e); showMsg("loginMsg","登录失败，请检查 CloudBase 配置或数据库权限"); }
}

async function loadUserPage(){
  const raw = getStoredUser();
  if(!raw){ window.location.href="login.html"; return; }
  if(raw.role === "admin"){ window.location.href="admin.html"; return; }
  try{
    const db = await getDb();
    const userRes = await db.collection("users").doc(raw._id).get();
    const user = userRes.data[0];
    setStoredUser(user);
    $("u_name").textContent = user.username;
    $("u_balance").textContent = money(user.balance);
    $("u_wcount").textContent = String(user.withdraw_count||0);
    $("u_wlimit").textContent = money(user.withdraw_limit||0);
    $("u_status").textContent = user.is_frozen ? "已冻结" : "正常";

    const productRes = await db.collection("products").where({is_active:true}).get();
    const pWrap = $("products"); pWrap.innerHTML = "";
    productRes.data.forEach(item=>{
      const div = document.createElement("div");
      div.className="table-item";
      div.innerHTML = `<img class="product-img" src="${item.image_url || 'art.jpg'}" alt=""><div class="mt"><strong>${item.name}</strong></div><div class="small mt">价格：${money(item.price)}</div><button class="btn btn-dark mt">买入</button>`;
      div.querySelector("button").onclick = ()=> buyProduct(item);
      pWrap.appendChild(div);
    });

    const invRes = await db.collection("inventory").where({user_id:user._id}).get();
    const iWrap = $("inventory"); iWrap.innerHTML = "";
    if(!invRes.data.length){ iWrap.innerHTML = `<div class="small muted">当前仓库为空</div>`; }
    invRes.data.forEach(item=>{
      const canSell = item.status === "holding" || item.status === "sell_rejected";
      const div = document.createElement("div");
      div.className="table-item";
      div.innerHTML = `<img class="product-img" src="${item.image_url || 'art.jpg'}" alt=""><div class="mt"><strong>${item.product_name}</strong></div><div class="small mt">买入价：${money(item.buy_price)}</div><div class="small mt">状态：${item.status}</div>${canSell ? '<button class="btn mt">申请卖出</button>' : ''}`;
      const btn = div.querySelector("button");
      if(btn) btn.onclick = ()=> submitSell(item, user);
      iWrap.appendChild(div);
    });
  }catch(e){ console.error(e); showMsg("userMsg","加载失败，请检查数据库权限"); }
}

async function submitRecharge(){
  const user = getStoredUser();
  const amount = Number($("amountInput").value);
  if(!amount || amount<=0){ showMsg("userMsg","请输入有效金额"); return; }
  const db = await getDb();
  await db.collection("requests").add({ user_id:user._id, username:user.username, type:"recharge", amount, status:"pending", created_at:new Date().toISOString(), remark:"" });
  $("qrSection").classList.remove("hidden");
  $("amountInput").value = "";
  showMsg("userMsg","需求已提交（嘻嘻，我在后台看着呢）");
}
async function submitWithdraw(){
  const user = getStoredUser();
  const amount = Number($("amountInput").value);
  if(!amount || amount<=0){ showMsg("userMsg","请输入有效金额"); return; }
  const db = await getDb();
  const userRes = await db.collection("users").doc(user._id).get();
  const fresh = userRes.data[0];
  if(fresh.is_frozen){ showMsg("userMsg","当前账户已冻结"); return; }
  if(!fresh.can_withdraw){ showMsg("userMsg","后台管理员不允许提现"); return; }
  if(amount > Number(fresh.withdraw_limit||0)){ showMsg("userMsg","超过单次提现额度"); return; }
  await db.collection("requests").add({ user_id:fresh._id, username:fresh.username, type:"withdraw", amount, status:"pending", created_at:new Date().toISOString(), remark:"" });
  $("amountInput").value = "";
  showMsg("userMsg","需求已提交（嘻嘻，我在后台看着呢）");
}
async function buyProduct(item){
  const user = getStoredUser();
  const db = await getDb();
  const userRes = await db.collection("users").doc(user._id).get();
  const fresh = userRes.data[0];
  if(Number(fresh.balance||0) < Number(item.price||0)){ showMsg("userMsg","余额不足"); return; }
  await db.collection("users").doc(fresh._id).update({ balance: Number(fresh.balance||0) - Number(item.price||0) });
  await db.collection("inventory").add({ user_id:fresh._id, username:fresh.username, product_id:item._id, product_name:item.name, buy_price:item.price, image_url:item.image_url, status:"holding", created_at:new Date().toISOString() });
  showMsg("userMsg","买入成功，已进入仓库");
  loadUserPage();
}
async function submitSell(item,user){
  const db = await getDb();
  await db.collection("inventory").doc(item._id).update({ status:"sell_pending" });
  await db.collection("requests").add({ user_id:user._id, username:user.username, type:"sell_item", amount:item.buy_price, status:"pending", created_at:new Date().toISOString(), remark:item._id });
  showMsg("userMsg","卖出需求已提交（嘻嘻，我在后台看着呢）");
  loadUserPage();
}

async function loadAdminPage(){
  const raw = getStoredUser();
  if(!raw){ window.location.href="login.html"; return; }
  if(raw.role !== "admin"){ window.location.href="user.html"; return; }
  try{
    const db = await getDb();
    const users = (await db.collection("users").get()).data;
    const uWrap = $("usersWrap"); uWrap.innerHTML = "";
    users.forEach(u=>{
      const div = document.createElement("div");
      div.className = "table-item";
      div.innerHTML = `<div><strong>${u.username}</strong></div>
        <div class="grid grid-2 mt">
          <input class="u-username input" value="${u.username}">
          <input class="u-password input" value="${u.password}">
          <input class="u-balance input" type="number" value="${u.balance}">
          <input class="u-wcount input" type="number" value="${u.withdraw_count||0}">
          <input class="u-wlimit input" type="number" value="${u.withdraw_limit||0}">
          <div><button class="btn toggle-withdraw">提现权：${u.can_withdraw ? "允许" : "禁止"}</button></div>
          <div><button class="btn toggle-freeze">状态：${u.is_frozen ? "冻结" : "正常"}</button></div>
        </div>
        <button class="btn btn-dark mt save-btn">保存修改</button>`;
      div.querySelector(".toggle-withdraw").onclick = ()=> updateUserField(u._id, { can_withdraw: !u.can_withdraw });
      div.querySelector(".toggle-freeze").onclick = ()=> updateUserField(u._id, { is_frozen: !u.is_frozen });
      div.querySelector(".save-btn").onclick = ()=> updateUserField(u._id, {
        username: div.querySelector(".u-username").value,
        password: div.querySelector(".u-password").value,
        balance: Number(div.querySelector(".u-balance").value),
        withdraw_count: Number(div.querySelector(".u-wcount").value),
        withdraw_limit: Number(div.querySelector(".u-wlimit").value),
      });
      uWrap.appendChild(div);
    });

    const reqs = (await db.collection("requests").orderBy("created_at","desc").get()).data;
    const rWrap = $("requestsWrap"); rWrap.innerHTML = "";
    if(!reqs.length){ rWrap.innerHTML = `<div class="small muted">暂无申请</div>`; }
    reqs.forEach(item=>{
      const div = document.createElement("div");
      div.className = "table-item";
      div.innerHTML = `<div><strong>${item.type === "recharge" ? "充值申请" : item.type === "withdraw" ? "提现申请" : "卖出申请"}</strong></div>
      <div class="small mt">账户：${item.username}</div><div class="small mt">金额：${money(item.amount)}</div><div class="small mt">状态：${item.status}</div>
      ${item.status === "pending" ? '<div class="mt row"><button class="btn approve">批准</button><button class="btn btn-dark reject">拒绝</button></div>' : ''}`;
      const a = div.querySelector(".approve"), r = div.querySelector(".reject");
      if(a) a.onclick = ()=> approveRequest(item);
      if(r) r.onclick = ()=> rejectRequest(item);
      rWrap.appendChild(div);
    });
  }catch(e){ console.error(e); showMsg("adminMsg","后台加载失败，请检查数据库权限"); }
}

async function updateUserField(id,patch){
  const db = await getDb();
  await db.collection("users").doc(id).update(patch);
  showMsg("adminMsg","已更新账户");
  loadAdminPage();
}
async function approveRequest(item){
  const db = await getDb();
  await db.collection("requests").doc(item._id).update({ status:"approved" });
  const user = (await db.collection("users").doc(item.user_id).get()).data[0];
  if(item.type === "recharge"){
    await db.collection("users").doc(item.user_id).update({ balance:Number(user.balance||0)+Number(item.amount||0) });
  }
  if(item.type === "withdraw"){
    const nextCount = Number(user.withdraw_count||0)+1;
    await db.collection("users").doc(item.user_id).update({ balance:Math.max(0, Number(user.balance||0)-Number(item.amount||0)), withdraw_count:nextCount, is_frozen: nextCount > 3 ? true : user.is_frozen });
  }
  if(item.type === "sell_item" && item.remark){
    await db.collection("inventory").doc(item.remark).update({ status:"sold" });
    await db.collection("users").doc(item.user_id).update({ balance:Number(user.balance||0)+Number(item.amount||0) });
  }
  showMsg("adminMsg","已批准申请");
  loadAdminPage();
}
async function rejectRequest(item){
  const db = await getDb();
  await db.collection("requests").doc(item._id).update({ status:"rejected" });
  if(item.type === "sell_item" && item.remark){
    await db.collection("inventory").doc(item.remark).update({ status:"sell_rejected" });
  }
  showMsg("adminMsg","已拒绝申请");
  loadAdminPage();
}
