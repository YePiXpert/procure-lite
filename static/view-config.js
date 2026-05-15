(function (global) {
    const createSubViews = (entries) => Object.freeze(
        entries.map((entry) => Object.freeze(entry))
    );

    const views = Object.freeze({
        dashboard: Object.freeze({
            id: 'dashboard',
            label: '\u6982\u89c8',
            icon: '\uD83D\uDCCA',
            title: '\u6982\u89c8\u770b\u677f',
            placement: 'primary',
        }),
        ledger: Object.freeze({
            id: 'ledger',
            label: '\u53F0\u8D26',
            icon: '\uD83D\uDCC4',
            title: '\u91C7\u8D2D\u53F0\u8D26\u660E\u7EC6',
            placement: 'primary',
        }),
        execution: Object.freeze({
            id: 'execution',
            label: '\u6267\u884C\u770B\u677F',
            icon: '\uD83E\uDE84',
            title: '\u91C7\u8D2D\u6267\u884C\u770B\u677F',
            placement: 'primary',
        }),
        operations: Object.freeze({
            id: 'operations',
            label: '\u8FD0\u8425\u5DE5\u4F5C\u53F0',
            icon: '\uD83D\uDCE6',
            title: '\u91C7\u8D2D\u8FD0\u8425\u5DE5\u4F5C\u53F0',
            placement: 'primary',
            defaultSubview: 'overview',
            subviews: createSubViews([
                {
                    id: 'overview',
                    label: '\u603B\u89C8',
                    title: '\u8FD0\u8425\u603B\u89C8',
                    description: '\u4ECE\u5F53\u65E5\u5F85\u529E\u3001\u4F18\u5148\u5F02\u5E38\u548C\u8DDF\u8FDB\u5165\u53E3\u5FEB\u901F\u770B\u6E05\u5F53\u524D\u91C7\u8D2D\u8FD0\u8425\u8282\u594F\u3002',
                    searchEnabled: false,
                },
                {
                    id: 'procurement',
                    label: '\u91C7\u8D2D\u8DDF\u8FDB',
                    title: '\u91C7\u8D2D\u4E0E\u6536\u8D27\u8DDF\u8FDB',
                    description: '\u805A\u7126\u5F85\u4E0B\u5355\u3001\u5F85\u6536\u8D27\u548C\u8865\u8D27\u5EFA\u8BAE\uFF0C\u8BA9\u91C7\u8D2D\u4E3B\u7EBF\u66F4\u50CF workspace \u800C\u4E0D\u662F\u957F\u9875\u6D41\u6C34\u5E10\u3002',
                    searchEnabled: true,
                    searchPlaceholder: '\u641C\u7D22\u91C7\u8D2D\u6761\u76EE\u3001\u4F9B\u5E94\u5546\u3001\u6536\u8D27\u6216\u8865\u8D27\u5EFA\u8BAE',
                },
                {
                    id: 'master-data',
                    label: '\u4E3B\u6570\u636E',
                    title: '\u4F9B\u5E94\u5546\u4E0E\u4EF7\u683C\u4E3B\u6570\u636E',
                    description: '\u96C6\u4E2D\u7EF4\u62A4\u4F9B\u5E94\u5546\u3001\u4EF7\u683C\u57FA\u7EBF\u548C\u5E93\u5B58\u6863\u6848\uFF0C\u907F\u514D\u4E0E\u5F53\u65E5\u6267\u884C\u961F\u5217\u62A2\u5360\u6CE8\u610F\u529B\u3002',
                    searchEnabled: true,
                    searchPlaceholder: '\u641C\u7D22\u4F9B\u5E94\u5546\u3001\u5546\u54C1\u3001\u4EF7\u683C\u8BB0\u5F55\u6216\u5E93\u5B58\u6863\u6848',
                },
                {
                    id: 'exceptions',
                    label: '\u5F02\u5E38\u5904\u7406',
                    title: '\u5F02\u5E38\u3001\u5BFC\u5165\u548C\u62A5\u9500\u5904\u7406',
                    description: '\u805A\u7126\u4F18\u5148\u5F02\u5E38\u3001\u5BFC\u5165\u6062\u590D\u3001\u53D1\u7968\u95ED\u73AF\u548C\u901A\u77E5\u7EDF\u4E00\u8DDF\u8FDB\u3002',
                    searchEnabled: true,
                    searchPlaceholder: '\u641C\u7D22\u5BFC\u5165\u4EFB\u52A1\u3001\u53D1\u7968\u3001\u5F02\u5E38\u63D0\u9192\u6216\u5173\u8054\u6761\u76EE',
                },
            ]),
        }),
        reports: Object.freeze({
            id: 'reports',
            label: '\u7EDF\u8BA1\u62A5\u8868',
            icon: '\uD83D\uDCC8',
            title: '\u7EDF\u8BA1\u62A5\u8868',
            placement: 'primary',
            defaultSubview: 'overview',
            subviews: createSubViews([
                {
                    id: 'overview',
                    label: '\u603B\u89C8',
                    title: '\u91C7\u8D2D\u603B\u89C8\u62A5\u8868',
                    description: '\u96C6\u4E2D\u770B\u603B\u989D\u3001\u90E8\u95E8\u7ED3\u6784\u548C\u72B6\u6001\u5206\u5E03\u3002',
                    searchEnabled: false,
                },
                {
                    id: 'periods',
                    label: '\u65F6\u95F4\u7EDF\u8BA1',
                    title: '\u6708\u5EA6 / \u5B63\u5EA6 / \u5E74\u5EA6\u7EDF\u8BA1',
                    description: '\u6309\u6708\u4EFD\u3001\u5B63\u5EA6\u3001\u5E74\u5EA6\u67E5\u770B\u91C7\u8D2D\u91D1\u989D\u8D8B\u52BF\u4E0E\u7ED3\u6784\u5206\u5E03\u3002',
                    searchEnabled: false,
                },
                {
                    id: 'suppliers',
                    label: '\u4F9B\u5E94\u5546',
                    title: '\u4F9B\u5E94\u5546\u5206\u6790',
                    description: '\u805A\u7126\u4F9B\u5E94\u5546\u91C7\u8D2D\u989D\u3001\u5E74\u5EA6\u8D8B\u52BF\u548C\u5546\u54C1\u660E\u7EC6\u3002',
                    searchEnabled: true,
                    searchPlaceholder: '\u641C\u7D22\u4F9B\u5E94\u5546\u3001\u5546\u54C1\u6216\u672A\u5F52\u5C5E\u8BB0\u5F55',
                },
                {
                    id: 'efficiency',
                    label: '\u6548\u7387',
                    title: '\u6267\u884C\u6548\u7387',
                    description: '\u67E5\u770B\u6F0F\u6597\u8F6C\u5316\u3001\u5468\u671F\u5206\u5E03\u548C\u91D1\u989D\u7ED3\u6784\u6548\u7387\u8868\u73B0\u3002',
                    searchEnabled: false,
                },
            ]),
        }),
        audit: Object.freeze({
            id: 'audit',
            label: '\u5BA1\u8BA1\u65E5\u5FD7',
            icon: '\uD83D\uDEE1\uFE0F',
            title: '\u5BA1\u8BA1\u65E5\u5FD7',
            placement: 'primary',
        }),
        settings: Object.freeze({
            id: 'settings',
            label: '\u7CFB\u7EDF\u8BBE\u7F6E',
            icon: '\u2699\uFE0F',
            title: '\u7CFB\u7EDF\u8BBE\u7F6E',
            placement: 'secondary',
        }),
    });

    const orderedViews = Object.freeze(Object.values(views));

    global.AppViewConfig = Object.freeze({
        ids: Object.freeze(orderedViews.map((view) => view.id)),
        views,
        primaryNav: Object.freeze(orderedViews.filter((view) => view.placement === 'primary')),
        secondaryNav: Object.freeze(orderedViews.filter((view) => view.placement === 'secondary')),
    });
})(window);
