import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { BaseDeviceDescriptor } from '../../types/BaseDeviceDescriptor';
import { DeviceTrackerEvent } from '../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../types/DeviceTrackerEventList';
import { html } from '../ui/HtmlTag';
import { ParamsDeviceTracker } from '../../types/ParamsDeviceTracker';
import { HostItem } from '../../types/Configuration';
import { Tool } from './Tool';
import Util from '../Util';
import { EventMap } from '../../common/TypedEmitter';

const TAG = '[BaseDeviceTracker]';

export abstract class BaseDeviceTracker<DD extends BaseDeviceDescriptor, TE extends EventMap> extends ManagerClient<
    ParamsDeviceTracker,
    TE
> {
    public static readonly ACTION_LIST = 'devicelist';
    public static readonly ACTION_DEVICE = 'device';
    public static readonly HOLDER_ELEMENT_ID = 'devices';
    public static readonly AttributePrefixInterfaceSelectFor = 'interface_select_for_';
    public static readonly AttributePlayerFullName = 'data-player-full-name';
    public static readonly AttributePlayerCodeName = 'data-player-code-name';
    public static readonly AttributePrefixPlayerFor = 'player_for_';
    protected static tools: Set<Tool> = new Set();
    protected static instanceId = 0;

    public static registerTool(tool: Tool): void {
        this.tools.add(tool);
    }

    public static buildUrl(item: HostItem): URL {
        const { secure, port, hostname } = item;
        const pathname = item.pathname ?? '/';
        const protocol = secure ? 'wss:' : 'ws:';
        const url = new URL(`${protocol}//${hostname}${pathname}`);
        if (port) {
            url.port = port.toString();
        }
        return url;
    }

    public static buildUrlForTracker(params: HostItem): URL {
        const wsUrl = this.buildUrl(params);
        wsUrl.searchParams.set('action', this.ACTION);
        return wsUrl;
    }

    public static buildLink(q: any, text: string, params: ParamsDeviceTracker): HTMLAnchorElement {
        let { hostname } = params;
        let port: string | number | undefined = params.port;
        let pathname = params.pathname ?? location.pathname;
        let protocol = params.secure ? 'https:' : 'http:';
        if (params.useProxy) {
            q.hostname = hostname;
            q.port = port;
            q.pathname = pathname;
            q.secure = params.secure;
            q.useProxy = true;
            protocol = location.protocol;
            hostname = location.hostname;
            port = location.port;
            pathname = location.pathname;
        }
        const hash = `#!${new URLSearchParams(q).toString()}`;
        const a = document.createElement('a');
        a.setAttribute('href', `${protocol}//${hostname}:${port}${pathname}${hash}`);
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('target', '_blank');
        a.classList.add(`link-${q.action}`);
        a.innerText = text;
        return a;
    }

    protected title = 'Device list';
    protected tableId = 'base_device_list';
    protected descriptors: DD[] = [];
    protected elementId: string;
    protected trackerName = '';
    protected id = '';
    private created = false;
    private messageId = 0;

    protected constructor(params: ParamsDeviceTracker, protected readonly directUrl: string) {
        super(params);
        this.elementId = `tracker_instance${++BaseDeviceTracker.instanceId}`;
        this.trackerName = `Unavailable. Host: ${params.hostname}, type: ${params.type}`;
        this.setBodyClass('list');
        this.setTitle();
        this.buildConnectContainer();
    }

    public buildConnectContainer() {
        const fragment = html`
        <div style="margin:10px 20px;">
            adb设备:<input type="text" id="ip-port" placeholder="127.0.0.1:5555">
            <button id="connectBtn">连接</button>
        </div>`.content;
        document.body.appendChild(fragment);

        const btn = document.getElementById('connectBtn');
        if(btn) btn.onclick = ()=>{
            const info = document.getElementById('ip-port') as HTMLInputElement;
            if(!info || info.value == "") return;
            const protocol = location.protocol;
            const hostname = location.hostname;
            const port = location.port;
            const pathname = location.pathname;
            const hash = `#!${new URLSearchParams({
                action: "devtools",
                udid: info.value
            }).toString()}`;
            window.open(`${protocol}//${hostname}:${port}${pathname}${hash}`, "_blank");
        };
    }

    public static parseParameters(params: URLSearchParams): ParamsDeviceTracker {
        const typedParams = super.parseParameters(params);
        const type = Util.parseString(params, 'type', true);
        if (type !== 'android' && type !== 'ios') {
            throw Error('Incorrect type');
        }
        return { ...typedParams, type };
    }

    protected getNextId(): number {
        return ++this.messageId;
    }

    protected buildDeviceTable(): void {
        const data = this.descriptors;
        const devices = this.getOrCreateTableHolder();
        const tbody = this.getOrBuildTableBody(devices);

        const block = this.getOrCreateTrackerBlock(tbody, this.trackerName);
        data.forEach((item) => {
            this.buildDeviceRow(block, item);
        });
    }

    private setNameValue(parent: Element | null, _name: string): void {
        if (!parent) {
            return;
        }
        const nameBlockId = `${this.elementId}_name`;
        let nameEl = document.getElementById(nameBlockId);
        if (!nameEl) {
            nameEl = document.createElement('div');
            nameEl.id = nameBlockId;
            nameEl.className = 'tracker-name';
        }
        
        const titleText = '设备列表';
        nameEl.innerText = titleText;
        
        // 添加视图切换按钮
        if (!document.getElementById('view-toggle-' + this.elementId)) {
            const viewToggle = document.createElement('div');
            viewToggle.id = 'view-toggle-' + this.elementId;
            viewToggle.className = 'view-toggle';
            viewToggle.style.display = 'inline-flex';
            viewToggle.style.verticalAlign = 'middle';
            
            const viewMode = localStorage.getItem("deviceViewMode") || "list";
            
            const gridBtn = document.createElement('button');
            gridBtn.id = 'gridViewBtn-' + this.elementId;
            gridBtn.innerHTML = '▦';
            gridBtn.title = '宫格视图';
            gridBtn.className = viewMode === 'grid' ? 'active' : '';
            gridBtn.onclick = () => this.setViewMode('grid', this.elementId);
            
            const listBtn = document.createElement('button');
            listBtn.id = 'listViewBtn-' + this.elementId;
            listBtn.innerHTML = '☰';
            listBtn.title = '列表视图';
            listBtn.className = viewMode === 'list' ? 'active' : '';
            listBtn.onclick = () => this.setViewMode('list', this.elementId);
            
            viewToggle.appendChild(gridBtn);
            viewToggle.appendChild(listBtn);
            nameEl.appendChild(viewToggle);
            
            // 初始化视图
            setTimeout(() => this.setViewMode(viewMode, this.elementId), 100);
        }
        
        parent.insertBefore(nameEl, parent.firstChild);
    }
    
    private setViewMode(mode: string, elementId: string): void {
        localStorage.setItem("deviceViewMode", mode);
        
        // 添加 class 到容器
        const deviceList = document.querySelector(`#devices .device-list`);
        if (deviceList) {
            deviceList.classList.remove("grid-view", "list-view");
            deviceList.classList.add(mode + "-view");
        }
        
        // 更新每个 device 元素
        const devices = document.querySelectorAll(`#devices .device`);
        devices.forEach((device) => {
            const d = device as HTMLElement;
            if (mode === 'grid') {
                d.classList.add("grid-card");
        // 加载缩略图
        const udid = d.querySelector('.device-serial')?.textContent;
        if (udid) {
          this.loadThumbnail(d, udid);

            // 添加更多按钮到右上角
            const existingMoreBtn = d.querySelector('.more-btn');
            if (!existingMoreBtn) {
              const moreBtn = document.createElement('button');
              moreBtn.className = 'more-btn';
              moreBtn.innerHTML = '⋮';
              moreBtn.title = '更多';
              moreBtn.onclick = (e) => {
                e.stopPropagation();
                const services = d.querySelector('.services');
                if (services) {
                  services.classList.toggle('show');
                }
              };
              d.appendChild(moreBtn);
            }

            // 只显示 device-serial、device-name 和状态圆点，隐藏其余
            const deviceHeader = d.querySelector('.device-header');
            if (deviceHeader) {
              // 隐藏 device-version
              const deviceVersion = deviceHeader.querySelector('.device-version');
              if (deviceVersion) {
                deviceVersion.classList.add('hidden');
              }
              // 隐藏设备名称（已改为显示 udid）
              const deviceName = deviceHeader.querySelector('.device-name');
              if (deviceName) {
                deviceName.classList.add('hidden');
              }
              // 隐藏状态文字
              const deviceState = deviceHeader.querySelector('.device-state');
              if (deviceState) {
                deviceState.classList.add('grid-state');
              }
              // 隐藏链接
              const links = d.querySelectorAll('a');
              links.forEach(link => link.classList.add('hidden'));
            }
            // 隐藏 services 容器
            const services = d.querySelector('.services');
            if (services) {
              services.classList.add('hidden');
            }
            // 点击卡片跳转到远程控制页面
            d.style.cursor = 'pointer';
            d.onclick = (e) => {
              // 如果点击的是更多按钮或服务菜单，不跳转
              if ((e.target as HTMLElement).closest('.more-btn') || (e.target as HTMLElement).closest('.services')) {
                return;
              }
              const udidEl = d.querySelector('.device-serial');
              if (udidEl && udidEl.textContent) {
                const udid = udidEl.textContent;
                const hostname = window.location.hostname;
                const port = window.location.port;
                const protocol = window.location.protocol;
                const pathname = window.location.pathname;
                const wsUrl = `ws://${hostname}:${port}/?action=proxy-adb&remote=tcp:8886&udid=${encodeURIComponent(udid)}`;
                const params = new URLSearchParams();
                params.set('action', 'stream');
                params.set('udid', udid);
                params.set('player', 'broadway');
                params.set('ws', wsUrl);
                const hash = `#!${params.toString()}`;
                window.open(`${protocol}//${hostname}:${port}${pathname}${hash}`, '_blank');
              }
            };
        }
            } else {
                d.classList.remove("grid-card");
            // 移除更多按钮
            const moreBtn = d.querySelector('.more-btn');
            if (moreBtn) {
              moreBtn.remove();
            }
            // 恢复显示隐藏的元素
            const deviceHeader = d.querySelector('.device-header');
            if (deviceHeader) {
              const deviceVersion = deviceHeader.querySelector('.device-version');
              if (deviceVersion) {
                deviceVersion.classList.remove('hidden');
              }
              const deviceName = deviceHeader.querySelector('.device-name');
              if (deviceName) {
                deviceName.classList.remove('hidden');
              }
              const deviceState = deviceHeader.querySelector('.device-state');
              if (deviceState) {
                deviceState.classList.remove('grid-state');
              }
              const links = d.querySelectorAll('a');
              links.forEach(link => link.classList.remove('hidden'));
            }
            const services = d.querySelector('.services');
            if (services) {
              services.classList.remove('hidden');
            }
            // 移除点击跳转事件
            d.onclick = null;
            d.style.cursor = '';
            // 切换到列表模式时移除预览图
            const thumbnail = d.querySelector('.device-thumbnail');
            if (thumbnail) {
                thumbnail.remove();
            }
            }
        });
        
        // 更新按钮状态
        const gridBtn = document.getElementById('gridViewBtn-' + elementId);
        const listBtn = document.getElementById('listViewBtn-' + elementId);
        if (gridBtn) gridBtn.classList.toggle("active", mode === "grid");
        if (listBtn) listBtn.classList.toggle("active", mode === "list");
    }

    
    
    private loadThumbnail(deviceEl: Element, udid: string): void {
        // 检查是否已有缩略图
        const existing = deviceEl.querySelector('.device-thumbnail');
        if (existing) return;

        // 直接给卡片设置 position: relative，不依赖 .device-header
        (deviceEl as HTMLElement).style.position = 'relative';
        (deviceEl as HTMLElement).style.overflow = 'hidden';

        const thumbnail = document.createElement("div");
        thumbnail.className = "device-thumbnail";
        thumbnail.style.backgroundImage = `url(/thumbnail/${encodeURIComponent(udid)})`;

        deviceEl.insertBefore(thumbnail, deviceEl.firstChild);
    }


    private getOrCreateTrackerBlock(parent: Element, controlCenterName: string): Element {
        let el = document.getElementById(this.elementId);
        if (!el) {
            el = document.createElement('div');
            el.id = this.elementId;
            parent.appendChild(el);
            this.created = true;
        } else {
            while (el.children.length) {
                el.removeChild(el.children[0]);
            }
        }
        this.setNameValue(el, controlCenterName);
        return el;
    }

    protected abstract buildDeviceRow(tbody: Element, device: DD): void;

    protected onSocketClose(event: CloseEvent): void {
        if (this.destroyed) {
            return;
        }
        console.log(TAG, `Connection closed: ${event.reason}`);
        setTimeout(() => {
            this.openNewConnection();
        }, 2000);
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            message = JSON.parse(event.data);
        } catch (error: any) {
            console.error(TAG, error.message);
            console.log(TAG, error.data);
            return;
        }
        switch (message.type) {
            case BaseDeviceTracker.ACTION_LIST: {
                const event = message.data as DeviceTrackerEventList<DD>;
                this.descriptors = event.list;
                this.setIdAndHostName(event.id, event.name);
                this.buildDeviceTable();
                break;
            }
            case BaseDeviceTracker.ACTION_DEVICE: {
                const event = message.data as DeviceTrackerEvent<DD>;
                this.setIdAndHostName(event.id, event.name);
                this.updateDescriptor(event.device);
                this.buildDeviceTable();
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    protected setIdAndHostName(id: string, trackerName: string): void {
        if (this.id === id && this.trackerName === trackerName) {
            return;
        }
        this.id = id;
        this.trackerName = trackerName;
        this.setNameValue(document.getElementById(this.elementId), trackerName);
    }

    protected getOrCreateTableHolder(): HTMLElement {
        const id = BaseDeviceTracker.HOLDER_ELEMENT_ID;
        let devices = document.getElementById(id);
        if (!devices) {
            devices = document.createElement('div');
            devices.id = id;
            devices.className = 'table-wrapper device-list';
            document.body.appendChild(devices);
        }
        return devices;
    }

    protected updateDescriptor(descriptor: DD): void {
        const idx = this.descriptors.findIndex((item: DD) => {
            return item.udid === descriptor.udid;
        });
        if (idx !== -1) {
            this.descriptors[idx] = descriptor;
        } else {
            this.descriptors.push(descriptor);
        }
    }

    protected getOrBuildTableBody(parent: HTMLElement): Element {
        const className = 'device-list';
        let tbody = document.querySelector(
            `#${BaseDeviceTracker.HOLDER_ELEMENT_ID} #${this.tableId}.${className}`,
        ) as Element;
        if (!tbody) {
            const fragment = html`<div id="${this.tableId}" class="${className}"></div>`.content;
            parent.appendChild(fragment);
            const last = parent.children.item(parent.children.length - 1);
            if (last) {
                tbody = last;
            }
        }
        return tbody;
    }

    public getDescriptorByUdid(udid: string): DD | undefined {
        if (!this.descriptors.length) {
            return;
        }
        return this.descriptors.find((descriptor: DD) => {
            return descriptor.udid === udid;
        });
    }

    public destroy(): void {
        super.destroy();
        if (this.created) {
            const el = document.getElementById(this.elementId);
            if (el) {
                const { parentElement } = el;
                el.remove();
                if (parentElement && !parentElement.children.length) {
                    parentElement.remove();
                }
            }
        }
        const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
        if (holder && !holder.children.length) {
            holder.remove();
        }
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelCode(): string {
        throw Error('Not implemented. Must override');
    }

    protected getChannelInitData(): Buffer {
        const code = this.getChannelCode();
        const buffer = Buffer.alloc(code.length);
        buffer.write(code, 'ascii');
        return buffer;
    }
}
