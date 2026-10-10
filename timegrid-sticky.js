/* ============================================================================
   TimeGrid · 固定头部滚动状态控制器
   唯一职责：滚动位置 > 0 时给 .tg-container 加 .is-scrolled（分隔线由 CSS 出），
   回到顶部时移除。不做任何 translate / 定位 / 高度测量——固定行为与停靠点
   全部由 CSS position: sticky 与 --tg-view-header-h 的 token 运算承担。

   分隔线全靠这个类：试过 animation-timeline: scroll() 的纯 CSS 方案，它在 sticky
   元素上会把时间线解析为 inactive 并把元素钉在 from 帧，反而把能用的路径压死，
   已弃用。

   插件侧接入（TimeGridView.ts）：
     // onOpen() 末尾，container.addClass('tg-container') 之后
     this.detachSticky = attachTimeGridSticky(container);
     // onClose()
     this.detachSticky?.();
     this.detachSticky = undefined;

   监听为 { passive: true }，卸载时移除并清掉状态类。
   处理器里不用 requestAnimationFrame 节流：面板所在 leaf 被折叠或窗口不在前台
   时 rAF 会暂停，回调永远不执行，分隔线就再也不出现。每次滚动只做一次
   scrollTop 读取 + 一次 classList.toggle，成本可忽略。
   ========================================================================== */
(function (global) {
	function attachTimeGridSticky(container) {
		if (!container) return function () {};

		function onScroll() {
			container.classList.toggle('is-scrolled', container.scrollTop > 0);
		}

		onScroll();
		container.addEventListener('scroll', onScroll, { passive: true });

		return function detach() {
			container.removeEventListener('scroll', onScroll);
			container.classList.remove('is-scrolled');
		};
	}

	global.attachTimeGridSticky = attachTimeGridSticky;
})(window);
