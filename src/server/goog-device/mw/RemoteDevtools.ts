import WS from 'ws';
import { Mw, RequestParameters } from '../../mw/Mw';
import { RemoteDevtoolsCommand } from '../../../types/RemoteDevtoolsCommand';
import { AdbUtils } from '../AdbUtils';
import { ACTION } from '../../../common/Action';

export class RemoteDevtools extends Mw {
    public static readonly TAG = 'RemoteDevtools';
    public static processRequest(ws: WS, params: RequestParameters): RemoteDevtools | undefined {
        const { action, request, url } = params;
        if (action !== ACTION.DEVTOOLS) {
            return;
        }
        const host = request.headers['host'];
        const udid = url.searchParams.get('udid');
        if (!udid) {
            ws.close(4003, `[${this.TAG}] Invalid value "${udid}" for "udid" parameter`);
            return;
        }
        if (typeof host !== 'string' || !host) {
            ws.close(4003, `[${this.TAG}] Invalid value "${host}" in "Host" header`);
            return;
        }
        console.log(`[${this.TAG}] host: ${host}, udid: ${udid}`);
        return new RemoteDevtools(ws, host, udid);
    }
    constructor(protected ws: WS, private readonly host: string, private readonly udid: string) {
        super(ws);
        this.adbConnect();
    }
    protected async adbConnect() {
        const udidArr = this.udid.split(':');
        if (udidArr.length == 2) {
            const [ip, port] = udidArr;
            return AdbUtils.connect(ip, parseInt(port)).then((info) => {
                console.log(`[${RemoteDevtools.TAG}] connect: ${info}`);
                this.ws.send(
                    JSON.stringify({
                        type: ACTION.DEVTOOLS,
                        data: {
                            deviceName: "adb连接成功",
                            deviceSerial: this.udid,
                            browsers: []
                        },
                    }),
                );
                return true;
            }).catch((err) => {
                console.error(err);
                this.ws.send(
                    JSON.stringify({
                        type: ACTION.DEVTOOLS,
                        data: {
                            deviceName: "adb连接失败",
                            deviceSerial: this.udid,
                            browsers: []
                        },
                    }),
                );
                return false;
            }); // 主动连接一次
        }
        return false;
    }
    protected onSocketMessage(event: WS.MessageEvent): void {
        let data;
        try {
            data = JSON.parse(event.data.toString());
        } catch (error: any) {
            console.log(`Received message: ${event.data}`);
            return;
        }
        if (!data || !data.command) {
            console.log(`Received message: ${event.data}`);
            return;
        }
        const command = data.command;
        switch (command) {
            case RemoteDevtoolsCommand.LIST_DEVTOOLS: {
                AdbUtils.getRemoteDevtoolsInfo(this.host, this.udid)
                    .then((list) => {
                        this.ws.send(
                            JSON.stringify({
                                type: ACTION.DEVTOOLS,
                                data: list,
                            }),
                        );
                    })
                    .catch((e) => {
                        const { message } = e;
                        console.error(`Command: "${command}", error: ${message}`);
                        this.ws.send(JSON.stringify({ command, error: message }));
                    });
                break;
            }
            default:
                console.warn(`Unsupported command: "${data.command}"`);
        }
    }
}
