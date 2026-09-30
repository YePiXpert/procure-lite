<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { workflowProductCreateSchema } from '@procure-lite/shared';
import { workflowApi } from '@/api/workflow';
import { apiError } from '@/api/client';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; created: [] }>();
const form = reactive({ itemName: '', specification: '', unit: '' });
const failure = ref('');
const errors = ref<Record<string, string>>({});
const saving = ref(false);
const dirty = computed(() => !!(form.itemName || form.specification || form.unit));
watch(() => props.open, (open) => { if (open) { Object.assign(form, { itemName: '', specification: '', unit: '' }); errors.value = {}; failure.value = ''; } });
async function submit() {
  if (saving.value) return;
  errors.value = {};
  if (!form.itemName.trim()) errors.value.itemName = '请填写物品名称';
  if (!form.unit.trim()) errors.value.unit = '请填写固定计量单位';
  const parsed = workflowProductCreateSchema.safeParse(form);
  if (Object.keys(errors.value).length) return;
  if (!parsed.success) { failure.value = parsed.error.issues.map((issue) => issue.message).join('；'); return; }
  saving.value = true;
  failure.value = '';
  try { await workflowApi.createProduct(parsed.data); form.itemName = ''; form.specification = ''; form.unit = ''; emit('update:open', false); emit('created'); }
  catch (cause) { failure.value = apiError(cause); }
  finally { saving.value = false; }
}
</script>
<template><Dialog :open="open" title="新增库存物品" description="品名、规格与计量单位共同区分物品；创建后可登记盘点增加，申请到货入库会自动建立物品" :dirty="dirty && !saving" :persistent="saving" @update:open="emit('update:open', $event)"><Input v-model="form.itemName" label="物品名称" required :error="errors.itemName" :disabled="saving" /><Input v-model="form.specification" label="规格" :disabled="saving" class="mt-4" /><Input v-model="form.unit" label="计量单位" required :error="errors.unit" :disabled="saving" class="mt-4" /><template #footer><p v-if="failure" role="alert" class="mr-auto text-[13px] text-red">{{ failure }}</p><Button variant="primary" :loading="saving" @click="submit">创建库存物品</Button></template></Dialog></template>
