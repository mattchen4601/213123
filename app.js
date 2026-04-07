async function getDb() {
  if (window._db) return window._db;
  const app = cloudbase.init({
    env: window.APP_CONFIG.envId,
    region: 'ap-shanghai',
    accessKey: window.APP_CONFIG.accessKey
  });
  window._db = app.database();
  return window._db;
}

function $(id){ return document.getElementById(id); }
function money(n){ return '¥' + Number(n || 0).toFixed(2); }
function escapeHtml(v){ return String(v ?? '').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function getStore(){ return window.sessionStorage; }
function setStoredUser(user){ getStore().setItem('demo_user', JSON.stringify(user)); }
function getStoredUser(){ try{ return JSON.parse(getStore().getItem('demo_user') || 'null'); }catch(e){ return null; } }
function clearStoredUser(){ getStore().removeItem('demo_user'); }
function logout(){ clearStoredUser(); window.location.href = 'login.html'; }

async function addDoc(collection, data){
  const db = await getDb();
  return db.collection(collection).add(data);
}
async function updateDoc(collection, id, patch){
  const db = await getDb();
  return db.collection(collection).doc(id).update(patch);
}
async function getDoc(collection, id){
  const db = await getDb();
  const res = await db.collection(collection).doc(id).get();
  return Array.isArray(res.data) ? res.data[0] : res.data;
}
async function getWhere(collection, where){
  const db = await getDb();
  const res = await db.collection(collection).where(where).get();
  return res.data || [];
}
async function getAll(collection, orderField, orderDir){
  const db = await getDb();
  let ref = db.collection(collection);
  if (orderField) ref = ref.orderBy(orderField, orderDir || 'asc');
  const res = await ref.get();
  return res.data || [];
}

function ensureModal(){
  if ($('appModalMask')) return;
  const html = `
    <div id="appModalMask" class="dialog-mask hidden">
      <div class="dialog-box dialog-box-large">
        <div id="appModalTitle" class="dialog-title">提示</div>
        <div id="appModalText" class="dialog-text"></div>
        <div id="appModalImageWrap" class="modal-image-wrap hidden">
          <img id="appModalImage" class="modal-image" src="" alt="">
        </div>
        <div class="dialog-actions">
          <button id="appModalCancel" class="btn hidden">取消</button>
          <button id="appModalOk" class="btn btn-dark">确认</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
function openModal(options){
  ensureModal();
  $('appModalTitle').textContent = options.title || '提示';
  $('appModalText').textContent = options.message || '';
  if (options.image) {
    $('appModalImage').src = options.image;
    $('appModalImageWrap').classList.remove('hidden');
  } else {
    $('appModalImage').src = '';
    $('appModalImageWrap').classList.add('hidden');
  }
  $('appModalCancel').classList.toggle('hidden', !options.showCancel);
  $('appModalOk').textContent = options.okText || '确认';
  $('appModalMask').classList.remove('hidden');
  return new Promise(resolve => {
    $('appModalOk').onclick = () => { $('appModalMask').classList.add('hidden'); resolve(true); };
    $('appModalCancel').onclick = () => { $('appModalMask').classList.add('hidden'); resolve(false); };
  });
}
function showDialog(message, title){
  return openModal({ title: title || '提示', message: message || '', showCancel: false, okText: '确认' });
}
function showImageConfirm(message, title){
  return openModal({ title: title || '请确认', message: message || '', image: 'recharge-qr.jpg', showCancel: false, okText: '确认' });
}
function showConfirm(message, title){
  return openModal({ title: title || '请确认', message: message || '', showCancel: true, okText: '确认' });
}

async function createNotice(userId, title, content){
  try{
    await addDoc('notices', {
      user_id: userId,
      title,
      content,
      created_at: new Date().toISOString()
    });
  }catch(e){
    console.error('createNotice failed', e);
  }
}

async function login(){
  const username = $('username').value.trim();
  const password = $('password').value.trim();
  if(!username || !password){ await showDialog('请输入账号和密码'); return; }
  try{
    const db = await getDb();
    const res = await db.collection('users').where({ username, password }).get();
    if(!res.data.length){ await showDialog('账号或密码错误'); return; }
    const user = res.data[0];
    setStoredUser(user);
    window.location.href = user.role === 'admin' ? 'admin.html' : 'user.html';
  }catch(e){
    console.error(e);
    await showDialog('登录失败，请检查 CloudBase 配置或数据库权限');
  }
}

async function refreshCurrentUser(){
  const raw = getStoredUser();
  if(!raw || !raw._id) return null;
  const fresh = await getDoc('users', raw._id);
  if (fresh) setStoredUser(fresh);
  return fresh;
}

async function guardFrozen(){
  const fresh = await refreshCurrentUser();
  if(!fresh) return { blocked: true, user: null };
  if(fresh.is_frozen){
    await showDialog('您已被冻结，请联系管理员');
    return { blocked: true, user: fresh };
  }
  return { blocked: false, user: fresh };
}

async function loadUserPage(){
  const raw = getStoredUser();
  if(!raw){ window.location.href = 'login.html'; return; }
  if(raw.role === 'admin'){ window.location.href = 'admin.html'; return; }
  try{
    const user = await refreshCurrentUser();
    if(!user){ clearStoredUser(); window.location.href = 'login.html'; return; }
    $('u_name').textContent = user.username || '-';
    $('u_balance').textContent = money(user.balance);
    $('u_wcount').textContent = String(user.withdraw_count || 0);
    $('u_wlimit').textContent = money(user.withdraw_limit || 0);
    $('u_status').textContent = user.is_frozen ? '已冻结' : '正常';

    const products = await getWhere('products', { is_active: true });
    const pWrap = $('products');
    pWrap.innerHTML = '';
    const visibleProducts = products.filter(item => {
      const status = item.market_status || 'listed';
      return status === 'listed';
    });
    if(!visibleProducts.length){
      pWrap.innerHTML = '<div class="small muted">当前没有可购买商品</div>';
    }
    visibleProducts.forEach(item => {
      const div = document.createElement('div');
      div.className = 'table-item';
      div.innerHTML = `
        <img class="product-img" src="${escapeHtml(item.image_url || 'art.jpg')}" alt="">
        <div class="mt"><strong>${escapeHtml(item.name || '未命名商品')}</strong></div>
        <div class="small mt">价格：${money(item.price)}</div>
        <button class="btn btn-dark mt">买入</button>`;
      div.querySelector('button').onclick = ()=> buyProduct(item);
      pWrap.appendChild(div);
    });

    const inventory = await getWhere('inventory', { user_id: user._id });
    const iWrap = $('inventory');
    iWrap.innerHTML = '';
    if(!inventory.length){ iWrap.innerHTML = '<div class="small muted">当前仓库为空</div>'; }
    inventory.forEach(item => {
      const statusMap = {
        holding: '持有中',
        sell_pending: '卖出审核中',
        sell_rejected: '卖出被拒绝',
        sold: '已卖出'
      };
      const canSell = item.status === 'holding' || item.status === 'sell_rejected';
      const div = document.createElement('div');
      div.className = 'table-item';
      div.innerHTML = `
        <img class="product-img" src="${escapeHtml(item.image_url || 'art.jpg')}" alt="">
        <div class="mt"><strong>${escapeHtml(item.product_name)}</strong></div>
        <div class="small mt">买入价：${money(item.buy_price)}</div>
        <div class="small mt">状态：${statusMap[item.status] || item.status || '-'}</div>
        ${canSell ? '<button class="btn mt">申请卖出</button>' : ''}`;
      const btn = div.querySelector('button');
      if(btn) btn.onclick = ()=> submitSell(item);
      iWrap.appendChild(div);
    });

    if($('noticeList')){
      let notices = [];
      try{
        notices = await getWhere('notices', { user_id: user._id });
      }catch(e){
        console.error(e);
      }
      notices = notices.sort((a,b)=> String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0,10);
      const nWrap = $('noticeList');
      nWrap.innerHTML = '';
      if(!notices.length){ nWrap.innerHTML = '<div class="small muted">暂无通知</div>'; }
      notices.forEach(item => {
        const div = document.createElement('div');
        div.className = 'table-item';
        div.innerHTML = `
          <div><strong>${escapeHtml(item.title || '通知')}</strong></div>
          <div class="small mt">${escapeHtml(item.content || '')}</div>
          <div class="small mt muted">${escapeHtml(item.created_at || '')}</div>`;
        nWrap.appendChild(div);
      });
    }
  }catch(e){
    console.error(e);
    await showDialog('用户页加载失败，请检查数据库权限');
  }
}

async function submitRecharge(){
  const amount = Number(($('amountInput')?.value || '').trim());
  if(!amount || amount <= 0){ await showDialog('请输入有效金额'); return; }
  const guard = await guardFrozen();
  if(guard.blocked) return;
  const ok = await showImageConfirm(`请扫码核对后点击确认。\n充值金额：${money(amount)}`, '充值确认');
  if(!ok) return;
  try{
    await addDoc('requests', {
      user_id: guard.user._id,
      username: guard.user.username,
      type: 'recharge',
      amount,
      status: 'pending',
      created_at: new Date().toISOString(),
      remark: ''
    });
    $('amountInput').value = '';
    await showDialog('需求已发送（嘻嘻我在后台看着呢）');
    await loadUserPage();
  }catch(e){
    console.error(e);
    await showDialog('充值申请提交失败');
  }
}

async function submitWithdraw(){
  const amount = Number(($('amountInput')?.value || '').trim());
  if(!amount || amount <= 0){ await showDialog('请输入有效金额'); return; }
  const guard = await guardFrozen();
  if(guard.blocked) return;
  const user = guard.user;
  if(!user.can_withdraw){ await showDialog('您的提现被管理员拒绝'); return; }
  if(amount > Number(user.withdraw_limit || 0)){ await showDialog('超过单次提现额度'); return; }
  const ok = await showImageConfirm(`请核对图片后点击确认。\n提现金额：${money(amount)}`, '提现确认');
  if(!ok) return;
  try{
    await addDoc('requests', {
      user_id: user._id,
      username: user.username,
      type: 'withdraw',
      amount,
      status: 'pending',
      created_at: new Date().toISOString(),
      remark: ''
    });
    $('amountInput').value = '';
    await showDialog('您的提现请求已收到（嘻嘻我在后台看着呢）');
    await loadUserPage();
  }catch(e){
    console.error(e);
    await showDialog('提现申请提交失败');
  }
}

async function buyProduct(item){
  const guard = await guardFrozen();
  if(guard.blocked) return;
  const user = guard.user;
  try{
    const latestProduct = await getDoc('products', item._id);
    if(!latestProduct || !latestProduct.is_active || (latestProduct.market_status || 'listed') !== 'listed'){
      await showDialog('该商品当前不可购买');
      await loadUserPage();
      return;
    }
    if(Number(user.balance || 0) < Number(latestProduct.price || 0)){
      await showDialog('余额不足');
      return;
    }
    const ok = await showConfirm(`确认买入“${latestProduct.name}”吗？\n将扣除 ${money(latestProduct.price)}。`, '确认买入');
    if(!ok) return;
    const nextBalance = Number(user.balance || 0) - Number(latestProduct.price || 0);
    await updateDoc('users', user._id, { balance: nextBalance });
    await addDoc('inventory', {
      user_id: user._id,
      username: user.username,
      product_id: latestProduct._id,
      product_name: latestProduct.name,
      buy_price: Number(latestProduct.price || 0),
      image_url: latestProduct.image_url || 'art.jpg',
      status: 'holding',
      created_at: new Date().toISOString()
    });
    await updateDoc('products', latestProduct._id, {
      market_status: 'owned',
      owner_user_id: user._id,
      owner_username: user.username
    });
    await createNotice(user._id, '买入成功', `你已成功买入“${latestProduct.name}”，当前余额 ${money(nextBalance)}。`);
    await loadUserPage();
    await showDialog(`买入成功，当前余额 ${money(nextBalance)}。`, '买入成功');
  }catch(e){
    console.error(e);
    await showDialog('买入失败，请检查数据库权限');
  }
}

async function submitSell(item){
  const guard = await guardFrozen();
  if(guard.blocked) return;
  const user = guard.user;
  try{
    await updateDoc('inventory', item._id, { status: 'sell_pending' });
    await addDoc('requests', {
      user_id: user._id,
      username: user.username,
      type: 'sell_item',
      amount: Number(item.buy_price || 0),
      status: 'pending',
      created_at: new Date().toISOString(),
      remark: item._id
    });
    await loadUserPage();
    await showDialog('卖出需求已提交（嘻嘻我在后台看着呢）');
  }catch(e){
    console.error(e);
    await showDialog('卖出申请提交失败');
  }
}

async function loadAdminPage(){
  const raw = getStoredUser();
  if(!raw){ window.location.href = 'login.html'; return; }
  if(raw.role !== 'admin'){ window.location.href = 'user.html'; return; }
  try{
    const users = await getAll('users');
    const uWrap = $('usersWrap');
    uWrap.innerHTML = '';
    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'table-item';
      div.innerHTML = `
        <div><strong>${escapeHtml(u.username)}</strong></div>
        <div class="grid grid-2 mt">
          <input class="u-username input" value="${escapeHtml(u.username)}">
          <input class="u-password input" value="${escapeHtml(u.password)}">
          <input class="u-balance input" type="number" value="${Number(u.balance || 0)}">
          <input class="u-wcount input" type="number" value="${Number(u.withdraw_count || 0)}">
          <input class="u-wlimit input" type="number" value="${Number(u.withdraw_limit || 0)}">
          <div><button class="btn toggle-withdraw">提现权：${u.can_withdraw ? '允许' : '禁止'}</button></div>
          <div><button class="btn toggle-freeze">状态：${u.is_frozen ? '冻结' : '正常'}</button></div>
        </div>
        <button class="btn btn-dark mt save-btn">保存修改</button>`;
      div.querySelector('.toggle-withdraw').onclick = ()=> toggleUserWithdraw(u);
      div.querySelector('.toggle-freeze').onclick = ()=> toggleUserFreeze(u);
      div.querySelector('.save-btn').onclick = ()=> saveUserChanges(u._id, div);
      uWrap.appendChild(div);
    });

    const reqs = await getAll('requests', 'created_at', 'desc');
    const rWrap = $('requestsWrap');
    rWrap.innerHTML = '';
    if(!reqs.length){ rWrap.innerHTML = '<div class="small muted">暂无申请</div>'; }
    reqs.forEach(item => {
      const title = item.type === 'recharge' ? '充值申请' : item.type === 'withdraw' ? '提现申请' : '卖出申请';
      const statusMap = { pending:'待处理', approved:'已批准', rejected:'已拒绝' };
      const div = document.createElement('div');
      div.className = 'table-item';
      div.innerHTML = `
        <div><strong>${title}</strong></div>
        <div class="small mt">账户：${escapeHtml(item.username)}</div>
        <div class="small mt">金额：${money(item.amount)}</div>
        <div class="small mt">状态：${statusMap[item.status] || item.status || '-'}</div>
        ${item.status === 'pending' ? '<div class="mt row"><button class="btn approve">批准</button><button class="btn btn-dark reject">拒绝</button></div>' : ''}`;
      const a = div.querySelector('.approve');
      const r = div.querySelector('.reject');
      if(a) a.onclick = ()=> approveRequest(item);
      if(r) r.onclick = ()=> rejectRequest(item);
      rWrap.appendChild(div);
    });

    if($('productsAdminWrap')){
      const products = await getAll('products');
      const pWrap = $('productsAdminWrap');
      pWrap.innerHTML = '';
      if(!products.length){ pWrap.innerHTML = '<div class="small muted">暂无商品</div>'; }
      products.forEach(p => {
        const status = p.market_status || 'listed';
        const statusText = status === 'listed' ? '已上架' : status === 'owned' ? '已买走' : '已下架';
        const div = document.createElement('div');
        div.className = 'table-item';
        div.innerHTML = `
          <img class="product-img" src="${escapeHtml(p.image_url || 'art.jpg')}" alt="">
          <div class="mt"><strong>${escapeHtml(p.name || '未命名商品')}</strong></div>
          <div class="small mt">价格：${money(p.price)}</div>
          <div class="small mt">状态：${statusText}</div>
          <div class="mt row"><button class="btn put-on">重新上架</button><button class="btn btn-dark take-off">强制下架</button></div>`;
        div.querySelector('.put-on').onclick = ()=> putProductOnShelf(p);
        div.querySelector('.take-off').onclick = ()=> takeProductOffShelf(p);
        pWrap.appendChild(div);
      });
    }
  }catch(e){
    console.error(e);
    await showDialog('后台加载失败，请检查数据库权限');
  }
}

async function saveUserChanges(id, box){
  try{
    await updateDoc('users', id, {
      username: box.querySelector('.u-username').value.trim(),
      password: box.querySelector('.u-password').value.trim(),
      balance: Number(box.querySelector('.u-balance').value || 0),
      withdraw_count: Number(box.querySelector('.u-wcount').value || 0),
      withdraw_limit: Number(box.querySelector('.u-wlimit').value || 0)
    });
    await loadAdminPage();
    await showDialog('账户信息已更新');
  }catch(e){
    console.error(e);
    await showDialog('更新账户失败');
  }
}

async function toggleUserWithdraw(user){
  try{
    await updateDoc('users', user._id, { can_withdraw: !user.can_withdraw });
    await loadAdminPage();
    await showDialog('提现权已更新');
  }catch(e){
    console.error(e);
    await showDialog('更新提现权失败');
  }
}

async function toggleUserFreeze(user){
  try{
    await updateDoc('users', user._id, { is_frozen: !user.is_frozen });
    await loadAdminPage();
    await showDialog('账户状态已更新');
  }catch(e){
    console.error(e);
    await showDialog('更新账户状态失败');
  }
}

async function putProductOnShelf(product){
  const ok = await showConfirm(`确认将“${product.name}”重新上架吗？`, '重新上架');
  if(!ok) return;
  try{
    await updateDoc('products', product._id, {
      market_status: 'listed',
      owner_user_id: '',
      owner_username: ''
    });
    await loadAdminPage();
    await showDialog('商品已重新上架');
  }catch(e){
    console.error(e);
    await showDialog('重新上架失败');
  }
}

async function takeProductOffShelf(product){
  const ok = await showConfirm(`确认将“${product.name}”强制下架吗？`, '强制下架');
  if(!ok) return;
  try{
    await updateDoc('products', product._id, { market_status: 'off_shelf' });
    await loadAdminPage();
    await showDialog('商品已下架');
  }catch(e){
    console.error(e);
    await showDialog('下架商品失败');
  }
}

async function approveRequest(item){
  const ok = await showConfirm('确认批准这条申请吗？', '批准申请');
  if(!ok) return;
  try{
    await updateDoc('requests', item._id, { status: 'approved' });
    const user = await getDoc('users', item.user_id);
    if(item.type === 'recharge'){
      const nextBalance = Number(user.balance || 0) + Number(item.amount || 0);
      await updateDoc('users', item.user_id, { balance: nextBalance });
      await createNotice(item.user_id, '充值申请已通过', `到账 ${money(item.amount)}，当前余额 ${money(nextBalance)}。`);
    }
    if(item.type === 'withdraw'){
      const nextCount = Number(user.withdraw_count || 0) + 1;
      const nextBalance = Math.max(0, Number(user.balance || 0) - Number(item.amount || 0));
      await updateDoc('users', item.user_id, {
        balance: nextBalance,
        withdraw_count: nextCount,
        is_frozen: user.is_frozen
      });
      await createNotice(item.user_id, '提现申请已通过', `提现 ${money(item.amount)} 已处理，当前余额 ${money(nextBalance)}。`);
    }
    if(item.type === 'sell_item' && item.remark){
      const inv = await getDoc('inventory', item.remark);
      const nextBalance = Number(user.balance || 0) + Number(item.amount || 0);
      await updateDoc('inventory', item.remark, { status: 'sold' });
      await updateDoc('users', item.user_id, { balance: nextBalance });
      if(inv && inv.product_id){
        await updateDoc('products', inv.product_id, {
          market_status: 'listed',
          owner_user_id: '',
          owner_username: ''
        });
      }
      await createNotice(item.user_id, '卖出申请已通过', `到账 ${money(item.amount)}，当前余额 ${money(nextBalance)}。`);
    }
    await loadAdminPage();
    await showDialog('已批准申请');
  }catch(e){
    console.error(e);
    await showDialog('批准申请失败');
  }
}

async function rejectRequest(item){
  const ok = await showConfirm('确认拒绝这条申请吗？', '拒绝申请');
  if(!ok) return;
  try{
    await updateDoc('requests', item._id, { status: 'rejected' });
    if(item.type === 'sell_item' && item.remark){
      const inv = await getDoc('inventory', item.remark);
      await updateDoc('inventory', item.remark, { status: 'sell_rejected' });
      await createNotice(item.user_id, '卖出申请被拒绝', `你的“${inv?.product_name || '商品'}”卖出申请被管理员拒绝。`);
    }
    if(item.type === 'recharge'){
      await createNotice(item.user_id, '充值申请被拒绝', `你的充值申请 ${money(item.amount)} 已被管理员拒绝。`);
    }
    if(item.type === 'withdraw'){
      await createNotice(item.user_id, '提现申请被拒绝', `你的提现申请 ${money(item.amount)} 已被管理员拒绝。`);
    }
    await loadAdminPage();
    await showDialog('已拒绝申请');
  }catch(e){
    console.error(e);
    await showDialog('拒绝申请失败');
  }
}
// ===== 关键修复：把函数挂到全局 =====
window.login = login;
window.loadUserPage = loadUserPage;
window.loadAdminPage = loadAdminPage;

window.submitRecharge = submitRecharge;
window.submitWithdraw = submitWithdraw;
window.buyProduct = buyProduct;
window.submitSell = submitSell;

window.logout = logout;