<script setup lang="ts">
import { ref } from 'vue';
import { workflowApi, type WorkflowDocumentRow, type WorkflowRequestRow, type WorkflowStockRow } from '@/api/workflow';
import { useToastStore } from '@/stores/toast';
import PurchaseRegisterDialog from './PurchaseRegisterDialog.vue';
import ReceiptRegisterDialog from './ReceiptRegisterDialog.vue';
import QuantityCommandDialog, { type QuantityCommand, type QuantityChoice } from './QuantityCommandDialog.vue';
import VoidDocumentDialog from './VoidDocumentDialog.vue';
import WorkflowMetadataDialog from './WorkflowMetadataDialog.vue';
import StockAdjustmentDialog from './StockAdjustmentDialog.vue';
import WorkflowAttachments from './WorkflowAttachments.vue';
import Dialog from '@/components/ui/Dialog.vue';
import DocumentInspectDialog from './DocumentInspectDialog.vue';
import { apiError } from '@/api/client';

const emit = defineEmits<{ recorded: [document: WorkflowDocumentRow]; attachmentsChanged: [] }>();
const toast = useToastStore();
const purchaseOpen = ref(false), purchaseTarget = ref<WorkflowRequestRow | null>(null);
const receiptOpen = ref(false), receiptTarget = ref<WorkflowDocumentRow | null>(null);
const commandOpen = ref(false), commandTarget = ref<{ action: QuantityCommand; choices: QuantityChoice[]; context: string; department: string } | null>(null);
const voidOpen = ref(false), voidTarget = ref<WorkflowDocumentRow | null>(null);
const metadataOpen = ref(false), metadataTarget = ref<WorkflowDocumentRow | null>(null);
const adjustmentOpen = ref(false), adjustmentTarget = ref<WorkflowStockRow | null>(null);
const attachmentsOpen = ref(false), attachmentsTarget = ref<WorkflowDocumentRow | null>(null);
const inspectionOpen = ref(false), inspectionTarget = ref<{ documentId?: number; lineId?: number }>({});

function purchase(request: WorkflowRequestRow) { purchaseTarget.value = request; purchaseOpen.value = true; }
function receipt(document: WorkflowDocumentRow) { receiptTarget.value = document; receiptOpen.value = true; }
function command(action: QuantityCommand, choices: QuantityChoice[], context = '', department = '') { commandTarget.value = { action, choices, context, department }; commandOpen.value = true; }
function voidDocument(document: WorkflowDocumentRow) { voidTarget.value = document; voidOpen.value = true; }
function metadata(document: WorkflowDocumentRow) { metadataTarget.value = document; metadataOpen.value = true; }
function adjust(product: WorkflowStockRow) { adjustmentTarget.value = product; adjustmentOpen.value = true; }
function attachments(document: WorkflowDocumentRow) { attachmentsTarget.value = document; attachmentsOpen.value = true; }
function inspectDocument(documentId: number) { inspectionTarget.value = { documentId }; inspectionOpen.value = true; }
function inspectLine(lineId: number) { inspectionTarget.value = { lineId }; inspectionOpen.value = true; }
async function refreshAttachments() {
  try {
    if (metadataTarget.value) metadataTarget.value = await workflowApi.document(metadataTarget.value.id);
    if (attachmentsTarget.value) attachmentsTarget.value = await workflowApi.document(attachmentsTarget.value.id);
    emit('attachmentsChanged');
  } catch (cause) { toast.error(apiError(cause)); }
}
function closeAll() { purchaseOpen.value = receiptOpen.value = commandOpen.value = voidOpen.value = metadataOpen.value = adjustmentOpen.value = attachmentsOpen.value = inspectionOpen.value = false; }
function recorded(document: WorkflowDocumentRow) { toast.success('业务登记已保存'); emit('recorded', document); }
defineExpose({ purchase, receipt, command, voidDocument, metadata, adjust, attachments, inspectDocument, inspectLine, closeAll });
</script>

<template>
  <PurchaseRegisterDialog v-if="purchaseTarget" v-model:open="purchaseOpen" :request="purchaseTarget" @recorded="recorded" />
  <ReceiptRegisterDialog v-if="receiptTarget" v-model:open="receiptOpen" :purchase="receiptTarget" @recorded="recorded" />
  <QuantityCommandDialog v-if="commandTarget" v-model:open="commandOpen" :action="commandTarget.action" :choices="commandTarget.choices" :context="commandTarget.context" :department="commandTarget.department" @recorded="recorded" />
  <VoidDocumentDialog v-if="voidTarget" v-model:open="voidOpen" :document="voidTarget" @recorded="recorded" />
  <WorkflowMetadataDialog v-if="metadataTarget" v-model:open="metadataOpen" :document="metadataTarget" @recorded="recorded"><template #attachments><WorkflowAttachments :document-id="metadataTarget.id" :attachments="metadataTarget.attachments" @changed="refreshAttachments" /></template></WorkflowMetadataDialog>
  <StockAdjustmentDialog v-if="adjustmentTarget" v-model:open="adjustmentOpen" :product="adjustmentTarget" @recorded="recorded" />
  <Dialog v-if="attachmentsTarget" :open="attachmentsOpen" title="签收凭证" :description="`领用发放 #${attachmentsTarget.id} · ${attachmentsTarget.date}`" @update:open="attachmentsOpen = $event"><WorkflowAttachments :document-id="attachmentsTarget.id" kind="SIGNOFF" :attachments="attachmentsTarget.attachments" @changed="refreshAttachments" /></Dialog>
  <DocumentInspectDialog :open="inspectionOpen" :document-id="inspectionTarget.documentId" :line-id="inspectionTarget.lineId" @update:open="inspectionOpen = $event" />
</template>
