(function (global) {
    global.OperationsCenterAppApi = {
        methods: {
                async loadOperationsCenter() {
                    this.operationsCenterLoading = true;
                    this.operationsError = '';
                    try {
                        this.operationsCenter = await global.AppOperationsApi.fetchCenter();
                        this.purchaseOrderDrafts = global.AppOperationsApi.buildPurchaseOrderDrafts(
                            this.operationsCenter.purchase_queue
                        );
                        this.receiptDrafts = global.AppOperationsApi.buildReceiptDrafts(
                            this.operationsCenter.receipt_queue
                        );
                        this.invoiceDrafts = global.AppOperationsApi.buildInvoiceDrafts(
                            this.operationsCenter.invoice_queue
                        );
                        this.operationsCenterLastLoadedAt = new Date().toISOString();
                        this.operationsCenterInitialized = true;
                    } catch (e) {
                        this.operationsCenterInitialized = false;
                        this.operationsError = e?.response?.data?.detail || e?.message || '加载运营中心失败';
                        this.showApiError('加载运营中心失败', e);
                    } finally {
                        this.operationsCenterLoading = false;
                    }
                },
                resetNewSupplierForm() {
                    this.newSupplier = {
                        name: '',
                        contact_name: '',
                        contact_phone: '',
                        contact_email: '',
                        notes: '',
                        is_active: true,
                    };
                },
                startEditSupplier(supplier) {
                    this.editingSupplier = {
                        id: supplier.id,
                        name: (supplier.name || '').toString(),
                        contact_name: (supplier.contact_name || '').toString(),
                        contact_phone: (supplier.contact_phone || '').toString(),
                        contact_email: (supplier.contact_email || '').toString(),
                        notes: (supplier.notes || '').toString(),
                        is_active: supplier.is_active !== false && supplier.is_active !== 0,
                    };
                },
                cancelEditSupplier() {
                    this.editingSupplier = null;
                },
                async saveEditSupplier() {
                    const supplier = this.editingSupplier;
                    if (!supplier || !supplier.id) return;
                    const name = (supplier.name || '').toString().trim();
                    if (!name) {
                        this.showToast('请先填写供应商名称', 'error');
                        return;
                    }
                    this.supplierEditSaving = true;
                    try {
                        const payload = {
                            name,
                            contact_name: (supplier.contact_name || '').toString().trim() || null,
                            contact_phone: (supplier.contact_phone || '').toString().trim() || null,
                            contact_email: (supplier.contact_email || '').toString().trim() || null,
                            notes: (supplier.notes || '').toString().trim() || null,
                            is_active: !!supplier.is_active,
                        };
                        await global.AppOperationsApi.updateSupplier(supplier.id, payload);
                        this.editingSupplier = null;
                        this.showToast('供应商已更新', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('更新供应商失败', e);
                    } finally {
                        this.supplierEditSaving = false;
                    }
                },
                async deleteSupplierRecord(supplierId) {
                    if (!supplierId) return;
                    if (!window.confirm('确定要删除该供应商吗？此操作不可撤销。')) return;
                    try {
                        await global.AppOperationsApi.deleteSupplier(supplierId);
                        if (this.editingSupplier && this.editingSupplier.id === supplierId) {
                            this.editingSupplier = null;
                        }
                        this.showToast('供应商已删除', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('删除供应商失败', e);
                    }
                },
                resetNewPriceRecordForm() {
                    this.newPriceRecord = {
                        item_name: '',
                        supplier_id: '',
                        unit_price: '',
                        purchase_link: '',
                        last_purchase_date: '',
                        last_serial_number: '',
                        lead_time_days: '',
                    };
                },
                resetNewInventoryProfileForm() {
                    this.newInventoryProfile = {
                        item_name: '',
                        current_stock: 0,
                        low_stock_threshold: 0,
                        unit: '',
                        preferred_supplier_id: '',
                        reorder_quantity: 0,
                        notes: '',
                    };
                    this.inventoryEditingItemName = '';
                },
                prefillInventoryProfileForm(source = {}) {
                    this.newInventoryProfile = {
                        item_name: (source.item_name || '').toString(),
                        current_stock: Number(source.current_stock || 0),
                        low_stock_threshold: Number(source.low_stock_threshold || 0),
                        unit: (source.unit || '').toString(),
                        preferred_supplier_id: source.preferred_supplier_id ? String(source.preferred_supplier_id) : '',
                        reorder_quantity: Number(source.reorder_quantity || 0),
                        notes: (source.notes || '').toString(),
                    };
                    this.inventoryEditingItemName = (source.item_name || '').toString().trim();
                },
                async createSupplierRecord() {
                    const supplierName = (this.newSupplier.name || '').toString().trim();
                    if (!supplierName) {
                        this.showToast('请先填写供应商名称', 'error');
                        return;
                    }
                    this.supplierSaving = true;
                    try {
                        const payload = {
                            ...this.newSupplier,
                            name: supplierName,
                            contact_name: (this.newSupplier.contact_name || '').toString().trim() || null,
                            contact_phone: (this.newSupplier.contact_phone || '').toString().trim() || null,
                            contact_email: (this.newSupplier.contact_email || '').toString().trim() || null,
                            notes: (this.newSupplier.notes || '').toString().trim() || null,
                        };
                        await global.AppOperationsApi.createSupplier(payload);
                        this.resetNewSupplierForm();
                        this.showToast('供应商已创建', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('创建供应商失败', e);
                    } finally {
                        this.supplierSaving = false;
                    }
                },
                async createSupplierPriceRecord() {
                    const itemName = (this.newPriceRecord.item_name || '').toString().trim();
                    const rawUnitPrice = (this.newPriceRecord.unit_price ?? '').toString().trim();
                    const unitPrice = Number(rawUnitPrice);
                    const rawLeadTime = (this.newPriceRecord.lead_time_days ?? '').toString().trim();
                    const leadTimeDays = rawLeadTime ? Number(rawLeadTime) : null;
                    if (!itemName) {
                        this.showToast('请先填写物品名称', 'error');
                        return;
                    }
                    if (!rawUnitPrice) {
                        this.showToast('请先填写单价', 'error');
                        return;
                    }
                    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                        this.showToast('请填写有效的非负单价', 'error');
                        return;
                    }
                    if (rawLeadTime && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
                        this.showToast('请填写有效的非负交期天数', 'error');
                        return;
                    }
                    this.priceSaving = true;
                    try {
                        const payload = {
                            item_name: itemName,
                            supplier_id: this.newPriceRecord.supplier_id ? Number(this.newPriceRecord.supplier_id) : null,
                            unit_price: unitPrice,
                            purchase_link: (this.newPriceRecord.purchase_link || '').toString().trim() || null,
                            last_purchase_date: (this.newPriceRecord.last_purchase_date || '').toString().trim() || null,
                            last_serial_number: (this.newPriceRecord.last_serial_number || '').toString().trim() || null,
                            lead_time_days: leadTimeDays,
                        };
                        await global.AppOperationsApi.createPriceRecord(payload);
                        this.resetNewPriceRecordForm();
                        this.showToast('价格记录已创建', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('创建价格记录失败', e);
                    } finally {
                        this.priceSaving = false;
                    }
                },
                async createPriceRecordFromPurchaseItem(item = {}) {
                    const itemId = Number(item?.item_id || item?.id || 0);
                    const itemName = (item?.item_name || '').toString().trim();
                    const draft = this.getPurchaseOrderDraft({ ...item, item_id: itemId });
                    const unitPriceCandidate = [
                        item?.unit_price,
                        item?.recommended_unit_price,
                        item?.latest_unit_price,
                    ].find((value) => value !== null && value !== undefined && `${value}`.trim() !== '');
                    const unitPrice = Number(unitPriceCandidate);
                    const leadTimeCandidate = [
                        item?.recommended_lead_time_days,
                        item?.latest_lead_time_days,
                    ].find((value) => value !== null && value !== undefined && `${value}`.trim() !== '');
                    const leadTimeDays = leadTimeCandidate === undefined ? null : Number(leadTimeCandidate);
                    const supplierId = draft.supplier_id
                        || item?.supplier_id
                        || item?.recommended_supplier_id
                        || item?.item_supplier_id
                        || '';
                    const purchaseLink = (
                        item?.purchase_link
                        || item?.recommended_purchase_link
                        || item?.latest_purchase_link
                        || ''
                    ).toString().trim();

                    if (!itemName) {
                        this.showToast('未找到物品名称，无法沉淀价格记录', 'error');
                        return;
                    }
                    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                        this.showToast('请先录入本次单价，或选择带历史单价的推荐供应商', 'error');
                        return;
                    }
                    if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
                        this.showToast('推荐交期无效，无法沉淀价格记录', 'error');
                        return;
                    }

                    const savingKey = itemId ? `item-${itemId}` : `name-${itemName}`;
                    this.priceMemorySavingKey = savingKey;
                    try {
                        await global.AppOperationsApi.createPriceRecord({
                            item_name: itemName,
                            supplier_id: supplierId ? Number(supplierId) : null,
                            unit_price: unitPrice,
                            purchase_link: purchaseLink || null,
                            last_purchase_date: (draft.ordered_date || item?.ordered_date || (global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10))).toString().trim() || null,
                            last_serial_number: (item?.serial_number || '').toString().trim() || null,
                            lead_time_days: leadTimeDays,
                        });
                        this.showToast('已沉淀为价格记忆', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('沉淀价格记录失败', e);
                    } finally {
                        this.priceMemorySavingKey = '';
                    }
                },
                async saveInventoryProfile() {
                    const itemName = (this.newInventoryProfile.item_name || '').toString().trim();
                    const currentStock = Number(this.newInventoryProfile.current_stock || 0);
                    const threshold = Number(this.newInventoryProfile.low_stock_threshold || 0);
                    const reorderQuantity = Number(this.newInventoryProfile.reorder_quantity || 0);
                    if (!itemName) {
                        this.showToast('请先填写物品名称', 'error');
                        return;
                    }
                    if (!Number.isFinite(currentStock) || currentStock < 0) {
                        this.showToast('当前库存必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    if (!Number.isFinite(threshold) || threshold < 0) {
                        this.showToast('低库存阈值必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    if (!Number.isFinite(reorderQuantity) || reorderQuantity < 0) {
                        this.showToast('建议补货数量必须是大于等于 0 的数字', 'error');
                        return;
                    }
                    this.inventorySaving = true;
                    try {
                        const payload = {
                            item_name: itemName,
                            current_stock: currentStock,
                            low_stock_threshold: threshold,
                            unit: (this.newInventoryProfile.unit || '').toString().trim() || null,
                            preferred_supplier_id: this.newInventoryProfile.preferred_supplier_id
                                ? Number(this.newInventoryProfile.preferred_supplier_id)
                                : null,
                            reorder_quantity: reorderQuantity,
                            notes: (this.newInventoryProfile.notes || '').toString().trim() || null,
                        };
                        await global.AppOperationsApi.saveInventoryProfile(payload);
                        this.resetNewInventoryProfileForm();
                        this.showToast('库存档案已保存', 'success');
                        await this.loadOperationsCenter();
                    } catch (e) {
                        this.showApiError('保存库存档案失败', e);
                    } finally {
                        this.inventorySaving = false;
                    }
                },
                getPurchaseOrderDraft(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) {
                        return {
                            supplier_id: '',
                            ordered_date: '',
                            expected_arrival_date: '',
                            status: 'draft',
                            note: '',
                        };
                    }
                    if (!this.purchaseOrderDrafts[itemId]) {
                        this.purchaseOrderDrafts[itemId] = {
                            supplier_id: item?.supplier_id ? String(item.supplier_id) : '',
                            ordered_date: item?.ordered_date || '',
                            expected_arrival_date: item?.expected_arrival_date || '',
                            status: item?.purchase_status || 'draft',
                            note: item?.purchase_note || '',
                        };
                    }
                    return this.purchaseOrderDrafts[itemId];
                },
                async savePurchaseOrder(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) return;
                    this.purchaseOrderSavingItemId = itemId;
                    try {
                        const draft = this.getPurchaseOrderDraft(item);
                        await global.AppOperationsApi.savePurchaseOrder(itemId, {
                            supplier_id: draft.supplier_id ? Number(draft.supplier_id) : null,
                            ordered_date: (draft.ordered_date || '').toString().trim() || null,
                            expected_arrival_date: (draft.expected_arrival_date || '').toString().trim() || null,
                            status: (draft.status || 'draft').toString().trim() || 'draft',
                            note: (draft.note || '').toString().trim() || null,
                        });
                        await this.loadOperationsCenter();
                        await this.refreshDataViews({ items: false, stats: true, execution: true });
                        this.showToast('采购单已保存，待办已刷新', 'success');
                    } catch (e) {
                        this.showApiError('保存采购单失败', e);
                    } finally {
                        this.purchaseOrderSavingItemId = null;
                    }
                },
                getReceiptDraft(item) {
                    const orderId = Number(item?.purchase_order_id || 0);
                    if (!orderId) {
                        return {
                            received_date: '',
                            received_quantity: item?.quantity || '',
                            note: '',
                        };
                    }
                    if (!this.receiptDrafts[orderId]) {
                        this.receiptDrafts[orderId] = {
                            received_date: item?.received_date || '',
                            received_quantity: item?.received_quantity ?? item?.quantity ?? '',
                            note: item?.receipt_note || '',
                        };
                    }
                    return this.receiptDrafts[orderId];
                },
                async savePurchaseReceipt(item) {
                    const orderId = Number(item?.purchase_order_id || 0);
                    if (!orderId) return;
                    this.purchaseReceiptSavingOrderId = orderId;
                    try {
                        const draft = this.getReceiptDraft(item);
                        await global.AppOperationsApi.savePurchaseReceipt(orderId, {
                            received_date: (draft.received_date || '').toString().trim() || null,
                            received_quantity: draft.received_quantity === '' || draft.received_quantity == null
                                ? null
                                : Number(draft.received_quantity),
                            note: (draft.note || '').toString().trim() || null,
                        });
                        await this.loadOperationsCenter();
                        await this.refreshDataViews({ items: false, stats: true, execution: true });
                        this.showToast('收货记录已保存，待办已刷新', 'success');
                    } catch (e) {
                        this.showApiError('保存收货记录失败', e);
                    } finally {
                        this.purchaseReceiptSavingOrderId = null;
                    }
                },
                getInvoiceDraft(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) {
                        return {
                            reimbursement_status: 'pending',
                            reimbursement_date: '',
                            invoice_number: '',
                            note: '',
                        };
                    }
                    if (!this.invoiceDrafts[itemId]) {
                        this.invoiceDrafts[itemId] = {
                            reimbursement_status: item?.reimbursement_status || 'pending',
                            reimbursement_date: item?.reimbursement_date || '',
                            invoice_number: item?.invoice_number || '',
                            note: item?.note || '',
                        };
                    }
                    return this.invoiceDrafts[itemId];
                },
                async saveInvoiceRecord(item) {
                    const itemId = Number(item?.item_id || 0);
                    if (!itemId) return;
                    this.invoiceSavingItemId = itemId;
                    try {
                        const draft = this.getInvoiceDraft(item);
                        const normalizedStatus = ['pending', 'submitted', 'reimbursed'].includes(draft.reimbursement_status)
                            ? draft.reimbursement_status
                            : 'pending';
                        if (normalizedStatus !== 'pending' && !(draft.reimbursement_date || '').toString().trim()) {
                            draft.reimbursement_date = global.AppTime ? global.AppTime.todayDateText() : new Date().toISOString().slice(0, 10);
                        }
                        await global.AppOperationsApi.saveInvoiceRecord(itemId, {
                            reimbursement_status: normalizedStatus,
                            reimbursement_date: (draft.reimbursement_date || '').toString().trim() || null,
                            invoice_number: (draft.invoice_number || '').toString().trim() || null,
                            note: (draft.note || '').toString().trim() || null,
                        });
                        await this.loadOperationsCenter();
                        await this.refreshDataViews({ items: false, stats: true, execution: false });
                        this.showToast('报销记录已保存，待办已刷新', 'success');
                    } catch (e) {
                        this.showApiError('保存报销记录失败', e);
                    } finally {
                        this.invoiceSavingItemId = null;
                    }
                },
                openInvoiceAttachmentPicker(itemId) {
                    this.invoiceAttachmentTargetItemId = Number(itemId || 0) || null;
                    if (!this.invoiceAttachmentTargetItemId) {
                        this.showToast('未找到可上传附件的条目', 'error');
                        return;
                    }
                    const input = document.getElementById('invoice-attachment-input');
                    if (input) {
                        input.value = '';
                        input.click();
                    }
                },
                async handleInvoiceAttachmentSelect(e) {
                    const files = e?.target?.files || [];
                    const file = files[0];
                    const itemId = Number(this.invoiceAttachmentTargetItemId || 0);
                    e.target.value = '';
                    if (!file || !itemId) return;
                    this.invoiceAttachmentUploading = true;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        await global.AppOperationsApi.uploadInvoiceAttachment(itemId, formData);
                        await this.loadOperationsCenter();
                        this.showToast('发票附件已上传，报销队列已刷新', 'success');
                    } catch (err) {
                        this.showApiError('上传发票附件失败', err);
                    } finally {
                        this.invoiceAttachmentUploading = false;
                        this.invoiceAttachmentTargetItemId = null;
                    }
                },
                async deleteInvoiceAttachmentRecord(attachmentId) {
                    const ok = await this.openConfirmDialog({
                        title: '删除发票附件',
                        message: '确认删除这份发票附件吗？删除后无法恢复。',
                        confirmText: '删除附件',
                        cancelText: '取消',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await global.AppOperationsApi.deleteInvoiceAttachment(attachmentId);
                        await this.loadOperationsCenter();
                        this.showToast('发票附件已删除，报销队列已刷新', 'success');
                    } catch (e) {
                        this.showApiError('删除发票附件失败', e);
                    }
                },
        },
    };
})(window);
