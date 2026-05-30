<template>
  <el-dialog
    v-model="visible"
    :title="$t('webApp.createTitle')"
    width="660px"
    :close-on-click-modal="false"
    @closed="resetForm"
    class="webapp-dialog"
  >
    <div class="dialog-body">
      <div class="dialog-desc">{{ $t('webApp.createDesc') }}</div>

      <div class="url-input-row">
        <el-input
          ref="urlInputRef"
          v-model="form.url"
          :placeholder="$t('webApp.urlPlaceholder')"
          clearable
          @keyup.enter="fetchInfo"
        />
        <el-button
          type="primary"
          :loading="fetching"
          @click="fetchInfo"
        >
          {{ $t('webApp.fetch') }}
        </el-button>
      </div>

      <div class="row-2col">
        <el-input v-model="form.name" :placeholder="$t('webApp.appNamePlaceholder')" clearable />
        <el-input v-model="form.alias" :placeholder="$t('webApp.aliasPlaceholder')" clearable />
      </div>

      <div class="icon-row">
        <div class="icon-preview" @click="selectIcon">
          <img v-if="iconPreviewUrl" :src="iconPreviewUrl" class="icon-img" />
          <img v-else :src="defaultIconUrl" class="icon-img" />
        </div>
        <el-button text type="primary" @click="selectIcon">
          {{ $t('webApp.uploadIcon') }}
        </el-button>
      </div>

      <div class="switch-row">
        <el-switch v-model="form.showNavbar" />
        <span class="switch-hint">{{ $t('webApp.navigationBarHint') }}</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="creating" @click="handleCreate">
        {{ $t('webApp.create') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import notification from '../utils/notification'
import { useAppStore } from '@/stores/appStore'

const { t } = useI18n()
const appStore = useAppStore()

const visible = ref(false)
const fetching = ref(false)
const creating = ref(false)
const urlInputRef = ref(null)
const iconPreviewUrl = ref('')
const localIconPath = ref('')
const defaultIconUrl = ref('')

async function loadDefaultIcon() {
    try {
        const result = await window.api.webApp.getDefaultIconPath()
        if (result.success && result.path) {
            defaultIconUrl.value = 'file://' + result.path
        }
    } catch (e) {
        // ignore
    }
}
loadDefaultIcon()

const form = reactive({
    url: '',
    name: '',
    alias: '',
    showNavbar: false
})

function open() {
    visible.value = true
    nextTick(() => {
        urlInputRef.value?.focus()
    })
}

function extractAliasFromUrl(urlStr) {
    try {
        const url = new URL(urlStr)
        let hostname = url.hostname || ''
        hostname = hostname.replace(/^www\./i, '')
        const parts = hostname.split('.')
        if (parts.length >= 2) {
            return parts[0]
        }
        return hostname.replace(/\./g, '-')
    } catch (e) {
        return ''
    }
}

function containsNonAscii(str) {
    return /[^\x00-\x7F]/.test(str)
}

function resetForm() {
    form.url = ''
    form.name = ''
    form.alias = ''
    form.showNavbar = false
    iconPreviewUrl.value = ''
    localIconPath.value = ''
    fetching.value = false
    creating.value = false
}

async function fetchInfo() {
    if (!form.url) return

    let urlToFetch = form.url.trim()
    if (!/^https?:\/\//i.test(urlToFetch)) {
        urlToFetch = 'https://' + urlToFetch
        form.url = urlToFetch
    }

    fetching.value = true
    try {
        const result = await window.api.webApp.fetchWebsiteInfo(urlToFetch)
        if (result.success && result.data) {
            if (result.data.title) {
                form.name = result.data.title
                if (!form.alias && containsNonAscii(form.name)) {
                    form.alias = extractAliasFromUrl(urlToFetch)
                }
            }
            if (result.data.iconPath) {
                localIconPath.value = result.data.iconPath
                iconPreviewUrl.value = 'file://' + result.data.iconPath
            }
        } else {
            notification.error(t('webApp.fetchFailed') + (result.error || ''))
        }
    } catch (error) {
        notification.error(t('webApp.fetchFailed') + error.message)
    } finally {
        fetching.value = false
    }
}

async function selectIcon() {
    try {
        const { canceled, filePaths } = await window.api.selectFile({
            title: t('webApp.selectIcon'),
            properties: ['openFile'],
            filters: [
                { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'] }
            ]
        })
        if (canceled || !filePaths?.[0]) return

        localIconPath.value = filePaths[0]
        iconPreviewUrl.value = 'file://' + filePaths[0]
    } catch (error) {
        console.error('Select icon failed:', error)
    }
}

function validate() {
    if (!form.url.trim()) {
        notification.warning(t('webApp.urlRequired'))
        return false
    }
    try {
        new URL(form.url.trim())
    } catch (e) {
        notification.warning(t('webApp.urlInvalid'))
        return false
    }
    if (!form.name.trim()) {
        notification.warning(t('webApp.appNameRequired'))
        return false
    }
    return true
}

async function handleCreate() {
    if (!validate()) return

    creating.value = true
    try {
        const options = {
            url: form.url.trim(),
            name: form.name.trim(),
            alias: form.alias.trim(),
            iconPath: localIconPath.value || '',
            showNavbar: form.showNavbar
        }

        const result = await window.api.webApp.createWebApp(options)
        if (result.success) {
            notification.success(t('webApp.createSuccess'))
            visible.value = false
            appStore.triggerAppListUpdate()
        } else {
            notification.error(t('webApp.createFailed') + (result.error || ''))
        }
    } catch (error) {
        notification.error(t('webApp.createFailed') + error.message)
    } finally {
        creating.value = false
    }
}

defineExpose({ open })
</script>

<style scoped>
.webapp-dialog :deep(.el-dialog__title) {
    font-size: 22px;
    font-weight: 600;
}

.dialog-body {
    display: flex;
    flex-direction: column;
    gap: 24px;
    font-size: 16px;
}

.dialog-desc {
    color: #606266;
    font-size: 16px;
    line-height: 1.8;
    text-align: left;
    text-indent: 2em;
}

.url-input-row {
    display: flex;
    gap: 8px;
}

.url-input-row .el-input {
    flex: 1;
}

.row-2col {
    display: flex;
    gap: 16px;
    align-items: center;
}

.row-2col > * {
    flex: 1;
    min-width: 0;
}

.icon-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.icon-preview {
    width: 44px;
    height: 44px;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    background: #f5f7fa;
    flex-shrink: 0;
}

.icon-preview:hover {
    border-color: #409eff;
}

.icon-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
}

.switch-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.switch-hint {
    color: #606266;
    font-size: 16px;
}
</style>
