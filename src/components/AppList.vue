<template>
  <div class="app-list-new-container">
    <!-- 按钮区域 -->
    <div class="button-section">
      <div class="primary-actions">
        <el-button type="primary" @click="importApp">
          {{ $t('appList.importApp') }}
        </el-button>
        <el-button @click="openCreateWebApp">
          {{ $t('webApp.createBtn') }}
        </el-button>
      </div>
      <div class="secondary-actions">
        <el-link type="primary" @click="toAnotherTab('appRepos')">
          {{ $t('appList.goToRepo') }}
        </el-link>
        <el-link type="primary" @click.prevent="toAnotherTab('devApp')">
          {{ $t('appList.goToDev') }}
        </el-link>
      </div>
    </div>

    <!-- APP列表区域 -->
    <div class="app-list-section" v-show="Object.keys(appsData).length > 0">
      <AppCard
        v-for="(appItem, uid) in appsData"
        :key="uid"
        :app="{
          name: appItem.name,
          version: appItem.version,
          description: appItem.description,
          logo: appItem.appJson?.logo || appItem.logo,
          platform: appItem.appJson?.platform || [],
          categories: appItem.appJson?.categories || [],
          tags: appItem.appJson?.tags || [],
          author: appItem.appJson?.author || appItem.author,
          sourceTag: appItem.sourceTag
        }"
        :uid="uid"
        :show-export="true"
        :show-open-data-dir="true"
        @run="loadApp"
        @delete="removeApp"
        @clear="clearData"
        @export="exportApp"
        @show-info="showAppInfo"
        @open-data-dir="openAppDataDir"
      />
    </div>

    <!-- 空状态提示 -->
    <div class="empty-section" v-show="Object.keys(appsData).length == 0">
      <p>{{ $t('appList.empty') }}</p>
    </div>
  </div>

  <CustomDrawer v-model="drawerInfo" :size="580">
    <div class="drawer-container">
      <div class="custom-tabs">
        <div class="custom-tabs-header">
          <div
            class="custom-tab-item"
            :class="{ active: activeTab === 0 }"
            @click="activeTab = 0"
          >
            {{ $t('appList.appIntro') }}
          </div>
          <div
            class="custom-tab-item"
            :class="{ active: activeTab === 1 }"
            v-if="historyFlag"
            @click="activeTab = 1"
          >
            {{ $t('appList.versionHistory') }}
          </div>
        </div>
        <div class="custom-tabs-content">
          <div class="drawer-content" v-show="activeTab === 0" id="divAppInfo" v-html="renderedReadme"></div>
          <div class="drawer-content" v-show="activeTab === 1" v-html="renderedHistory"></div>
        </div>
      </div>
    </div>
  </CustomDrawer>

  <CreateWebAppDialog ref="createWebAppDialogRef" />
</template>

<script setup>
import { onBeforeMount, ref, watch, computed } from 'vue'
import notification from '../utils/notification'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/appStore'
import { md } from '@/utils/markdownRenderer'
import CustomDrawer from './CustomDrawer.vue'
import AppCard from './AppCard.vue'
import CreateWebAppDialog from './CreateWebAppDialog.vue'

const { t } = useI18n()
const activeTab = ref(0)
const createWebAppDialogRef = ref(null)

// 定义触发的自定义事件
const emit = defineEmits(['switchTab'])
const toAnotherTab = (name) => {
  emit('switchTab', name)
}

let appsData = ref({})
const appStore = useAppStore()
const drawerInfo = ref(false)
const readme = ref(null)
const history = ref(null)
const historyFlag = ref(false)

onBeforeMount(() => {
  loadAppsData()
})

watch(
  () => appStore.appListUpdated,
  () => {
    loadAppsData()
  }
)

/**
 * 并行获取所有应用的详细信息（readme/history）
 */
function fetchAppsDetails(apps) {
  const promises = Object.keys(apps).map(uid => {
    return new Promise((resolve) => {
      window.api.app.info(uid, (infoResult) => {
        if (infoResult.success) {
          resolve({ uid, data: infoResult.data })
        } else {
          console.error(`获取应用 ${uid} 信息失败:`, infoResult.msg)
          resolve(null)
        }
      })
    })
  })

  // 等待所有应用信息加载完成
  Promise.all(promises).then(results => {
    results.forEach(item => {
      if (item && item.data) {
        const existingApp = appsData.value[item.uid]
        if (existingApp) {
          appsData.value[item.uid] = {
            ...existingApp,
            readme: item.data.readme,
            history: item.data.history
          }
        }
      }
    })
  })
}

/**
 * 导入已有app
 */
function loadAppsData() {
  window.api.app.all(result => {
    if (result.success) {
      // 初始化加载状态
      appsData.value = result.data
      // 并行获取详细信息
      fetchAppsDetails(result.data)
    } else {
      console.info(result.msg || '获取APP列表失败')
    }
  })
}

function openCreateWebApp() {
  createWebAppDialogRef.value?.open()
}

// 显示应用信息（点击 logo 或名称时）
function showAppInfo(uid) {
  const appData = appsData.value[uid]
  if (!appData) {
    console.error('应用数据不存在:', uid)
    return
  }

  // 设置 readme 和 history
  readme.value = appData.readme || ''
  history.value = appData.history || ''
  historyFlag.value = !!appData.history

  // 打开 drawer
  drawerInfo.value = true
}

// 渲染后的 readme HTML
const renderedReadme = computed(() => {
  if (!readme.value) return ''
  try {
    return md.render(readme.value)
  } catch (error) {
    console.error('渲染 README 失败:', error)
    return readme.value
  }
})

// 渲染后的 history HTML
const renderedHistory = computed(() => {
  if (!history.value) return ''
  try {
    return md.render(history.value)
  } catch (error) {
    console.error('渲染 HISTORY 失败:', error)
    return history.value
  }
})

// 运行app
function loadApp(uid) {
  window.api.app.load(uid)
}

// 删除app数据
function clearData(uid) {
  window.api.app.clearData(uid, (result) => {
    console.info('clearData result=', result)
    if (!result.success) {
      notification.error(result.msg)
      return
    }
    notification.success(t('appList.clearDataSuccess'))
  })
}

// 移除app
function removeApp(uid) {
  // 这里增加一个确认弹框
  window.api.app.remove({
    id: uid,
    devTag: false
  }, (result) => {
    console.info('remove result=', result)
    if (!result.success) {
      notification.error(result.msg)
      return
    }
    // 触发删除当前应用的事件
    delete appsData.value[uid]
    appStore.setRemovedAppId(uid)
    notification.success(t('appList.removeSuccess'))
  })
}

// 从zip压缩文件导入app
async function importApp() {
  try {
    // 1. 选择 .zip 文件
    const { canceled, filePaths } = await window.api.selectFile({
      title: t('appList.selectFile'),
      properties: ['openFile'],
      filters: [{ name: 'App Files', extensions: ['zip'] }],
    })
    if (canceled || !filePaths?.[0]) return

    const zipPath = filePaths[0]

    // 2. 导入文件：复制文件并重命名
    const { success, error } = await window.api.importApp(zipPath)
    if (!success) {
      throw new Error(error)
    }

    window.api.app.all(result => {
      if (!result.success) {
        return
      }
      appsData.value = result.data
      // 并行获取详细信息
      fetchAppsDetails(result.data)
    })

    notification.success(t('appList.importSuccess'))
  } catch (error) {
    console.error('导入应用失败:', error)
    notification.error(t('appList.importFailed') + error.message)
  }
}

async function exportApp(uid) {
  try {
    const appItem = appsData.value[uid]
    if (!appItem) return

    const appId = appItem.appJson?.id || appItem.id || uid
    const version = appItem.appJson?.version || appItem.version || ''
    const defaultName = version ? `${appId}-${version}.zip` : `${appId}.zip`

    const { canceled, filePath } = await window.api.selectExportPath(defaultName)
    if (canceled || !filePath) return

    const { success, error } = await window.api.exportApp(uid, filePath)
    if (!success) {
      throw new Error(error)
    }

    notification.success(t('appList.exportSuccess'))
  } catch (error) {
    console.error('导出应用失败:', error)
    notification.error(t('appList.exportFailed') + error.message)
  }
}

// 打开APP数据目录
async function openAppDataDir(uid) {
  try {
    const result = await window.api.app.openDataDir(uid)
    if (!result.success) {
      notification.error(result.msg)
    }
  } catch (error) {
    notification.error(t('appList.openDataDirFailed') + error.message)
  }
}
</script>

<style scoped>
.app-list-new-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 0 6px;
}

/* 按钮区域 */
.button-section {
  height: 60px;
  padding: 10px 8px;
  line-height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.primary-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 次要操作链接 */
.secondary-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

/* APP列表区域 - 响应式网格布局 */
.app-list-section {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
  gap: 12px;
  align-content: start;
}

/* 当窗口较窄时，单列显示 */
@media (max-width: 560px) {
  .app-list-section {
    grid-template-columns: 1fr;
  }
}

/* 空状态 */
.empty-section {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #909399;
  font-size: 14px;
}

/* 抽屉样式 */
.drawer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

/* 自定义 Tabs 样式 */
.custom-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.custom-tabs-header {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid #e4e7ed;
  background: #f5f7fa;
}

.custom-tab-item {
  flex: 1;
  padding: 0 20px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  cursor: pointer;
  font-size: 18px;
  font-weight: bold;
  color: #606266;
  transition: all 0.3s;
  user-select: none;
}

.custom-tab-item:hover {
  color: #409eff;
  background: #ecf5ff;
}

.custom-tab-item.active {
  color: #409eff;
  background: #fff;
  border-bottom: 2px solid #409eff;
  font-weight: bold;
}

.custom-tabs-content {
  flex: 1;
  overflow: hidden;
  overflow-y: auto;
}

.drawer-content {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  text-align: left;
  box-sizing: border-box;
}

.drawer-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.drawer-content :deep(pre) {
  background-color: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.drawer-content :deep(code) {
  background-color: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
}

.drawer-content :deep(p) {
  margin: 8px 0;
  line-height: 1.6;
}

.drawer-content :deep(h1),
.drawer-content :deep(h2),
.drawer-content :deep(h3) {
  margin-top: 20px;
  margin-bottom: 10px;
  font-weight: bold;
}

.drawer-content :deep(h1) {
  font-size: 28px;
  border-bottom: 2px solid #eee;
  padding-bottom: 10px;
}

.drawer-content :deep(h2) {
  font-size: 24px;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}

.drawer-content :deep(h3) {
  font-size: 20px;
}

.drawer-content :deep(ul),
.drawer-content :deep(ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.drawer-content :deep(li) {
  margin: 4px 0;
}

.drawer-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.drawer-content :deep(th),
.drawer-content :deep(td) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.drawer-content :deep(th) {
  background-color: #f5f5f5;
  font-weight: bold;
}
</style>
