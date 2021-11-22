// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import Chart, { ChartData, ChartOptions, ChartTooltipItem } from 'chart.js';
import './MachineDetail.css';
import { RouteComponentProps, Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import { API, I18n } from 'aws-amplify';
import { getRealTimeMachineData, IGetRealTimeMachineDataReqParams, IGetRealTimeMachineDataResponse, IGetRealTimeMachineDataChunk } from '../../graphql/queries';
import moment from 'moment';
import { MachineStatus } from '../../util/data-structures';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';

type MachineDetailProps = {
    machineId: string;
};

type MachineDetailState = {
    machineId: string;
    isLoading: boolean;
    refreshIntervalId?: NodeJS.Timeout;
    chartDataChunks: IGetRealTimeMachineDataChunk[];
    totalProductionCount: number;
    chart?: Chart;
};

export class MachineDetail extends React.Component<RouteComponentProps<MachineDetailProps>, MachineDetailState> {
    private readonly REFRESH_INTERVAL = 60 * 1000; // 60 * 1000 = one minute
    private readonly DEFAULT_LOOKBACK_IN_HOURS = 12;
    private _chartRef = React.createRef<HTMLCanvasElement>();

    constructor(props: RouteComponentProps<MachineDetailProps>) {
        super(props);
        this.state = {
            isLoading: true,
            machineId: atob(props.match.params.machineId),
            chartDataChunks: [],
            totalProductionCount: 0
        };
        this.refreshData = this.refreshData.bind(this);
        this.buildChart = this.buildChart.bind(this);
        this.chartTooltipCallback = this.chartTooltipCallback.bind(this);
    }

    async componentDidMount() {
        const lookbackTimestamp = moment.utc().subtract(this.DEFAULT_LOOKBACK_IN_HOURS, 'hours');

        await this.loadMachineData(lookbackTimestamp, false);
        this.setState({ refreshIntervalId: setInterval(this.refreshData, this.REFRESH_INTERVAL) });
    }

    componentWillUnmount() {
        if (this.state.refreshIntervalId) {
            clearInterval(this.state.refreshIntervalId);
        }
    }

    async loadMachineData(lookbackTimestamp: moment.Moment, incrementalRefresh: boolean) {
        this.setState({ isLoading: true });

        const currentChartDataChunks = this.state.chartDataChunks;
        const now = moment.utc().unix();

        const getRealTimeMachineDataParams: IGetRealTimeMachineDataReqParams = {
            id: this.state.machineId,
            startTimestamp: lookbackTimestamp.unix(),
            endTimestamp: now,
            incrementalRefresh
        };

        const resp = (await API.graphql({
            query: getRealTimeMachineData,
            variables: getRealTimeMachineDataParams
        }) as IGetRealTimeMachineDataResponse);

        for (const dataChunk of resp.data.getRealTimeMachineData.dataChunks) {
            // Check if the dataChunk is in the existing data set. If so, replace the existing with 
            // the new one. If not, add the new one
            const idx = currentChartDataChunks.findIndex(item => item.dataAsOfUTCUnixTimestamp === dataChunk.dataAsOfUTCUnixTimestamp);

            if (idx > -1) {
                currentChartDataChunks.splice(idx, 1);
            }

            currentChartDataChunks.push(dataChunk);
        }

        currentChartDataChunks.sort(this.sortByChunkTimestamp);

        this.setState({
            chartDataChunks: currentChartDataChunks
                .filter(item => item.dataAsOfUTCUnixTimestamp > moment.utc().subtract(this.DEFAULT_LOOKBACK_IN_HOURS, 'hours').unix())
        });
        this.buildChart();

        let totalProductionCount = 0;
        let currentMaxProductionCount = 0;
        this.state.chartDataChunks.forEach(chunk => {
            if (chunk.productionCountValue) {
                try {
                    const value = parseInt(chunk.productionCountValue, 10);
                    if (value > currentMaxProductionCount) {
                        currentMaxProductionCount = value;
                    } else if (currentMaxProductionCount > value) {
                        totalProductionCount += currentMaxProductionCount;
                        currentMaxProductionCount = value;
                    }
                } catch (err) {
                    console.log('Unable to calculate total production count');
                    totalProductionCount = 0;
                    currentMaxProductionCount = 0;
                }
            }
        });

        totalProductionCount += currentMaxProductionCount;
        this.setState({ isLoading: false, totalProductionCount });
    }

    async refreshData() {
        if (this.state.isLoading || !this.state.chartDataChunks) { return; }

        const mostRecentData = this.state.chartDataChunks[this.state.chartDataChunks.length - 1].dataAsOfUTCUnixTimestamp;
        const lookbackTimestamp = moment.unix(mostRecentData).utc();
        await this.loadMachineData(lookbackTimestamp, true);
    }

    buildChart(): void {
        const myChartRef = this._chartRef.current!.getContext('2d');

        const statusData: number[] = [];
        const statusBGColors: string[] = [];
        const productionCounts: (number | null)[] = [];

        for (let i = 0; i < this.state.chartDataChunks.length; i++) {
            const chunk = this.state.chartDataChunks[i];
            if (chunk.productionCountValue) {
                productionCounts.push(parseInt(chunk.productionCountValue, 10));
            } else {
                productionCounts.push(null);
            }

            statusData.push(1); // This value is arbitrary
            statusBGColors.push(this.mapStatusToColor(chunk.statusValue as MachineStatus));
        }

        const minProductionCount = Math.min(...(productionCounts.filter(count => count !== null) as number[]));
        const maxProductionCount = Math.max(...(productionCounts.filter(count => count !== null) as number[]));

        const options: ChartOptions = {
            animation: { duration: 0 },
            tooltips: {
                enabled: true,
                callbacks: { label: this.chartTooltipCallback }
            },
            scales: {
                xAxes: [{
                    display: true,
                    scaleLabel: { display: true, labelString: `${I18n.get('machine.detail.axis.label.lastHours')} (UTC)`, fontStyle: 'bold' },
                    ticks: {
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                }],
                yAxes: [
                    {
                        id: 'status',
                        display: false,
                        stacked: true,
                    },
                    {
                        scaleLabel: { display: true, labelString: I18n.get('machine.detail.axis.label.productionCount'), fontStyle: 'bold' },
                        id: 'production-count',
                        position: 'right',
                        ticks: {
                            suggestedMax: maxProductionCount,
                            suggestedMin: minProductionCount
                        }
                    }
                ]
            },
            legend: { display: false }
        };

        const data: ChartData = {
            labels: this.state.chartDataChunks.map(chunk => moment.unix(chunk.dataAsOfUTCUnixTimestamp).utc().format('HH:mm:ss')),
            datasets: [
                {
                    label: I18n.get('machine.detail.axis.label.productionCount'),
                    type: 'line',
                    data: productionCounts,
                    pointRadius: 1,
                    pointHoverRadius: 1,
                    borderColor: 'blue',
                    borderWidth: 2,
                    fill: false,
                    yAxisID: 'production-count'
                },
                {
                    label: 'Status',
                    type: 'bar',
                    data: statusData,
                    backgroundColor: statusBGColors,
                    barPercentage: 1,
                    categoryPercentage: 1,
                    yAxisID: 'status'
                }
            ]
        };

        if (!this.state.chart) {
            this.setState({ chart: new Chart(myChartRef!, { type: 'bar', data, options }) });
        } else {
            const chart = this.state.chart;
            chart.data = data;
            chart.update();
            this.setState({ chart });
        }
    }

    chartTooltipCallback(item: ChartTooltipItem, chart: ChartData): string {
        return `${I18n.get('machine.detail.axis.tooltip.status')}: ${this.state.chartDataChunks[item.index!].statusValue}, ${I18n.get('machine.detail.axis.tooltip.productionCount')} ${this.state.chartDataChunks[item.index!].productionCountValue}`;
    }

    mapStatusToColor(status: MachineStatus): string {
        switch (status) {
            case MachineStatus.UP:
                return '#6AAF35';
            case MachineStatus.DOWN:
                return '#D13212';
            case MachineStatus.IDLE:
                return '#DFB52C';
            default:
                return '#f8f9fa';
        }
    }

    sortByChunkTimestamp(a: IGetRealTimeMachineDataChunk, b: IGetRealTimeMachineDataChunk) {
        if (a.dataAsOfUTCUnixTimestamp > b.dataAsOfUTCUnixTimestamp) { return 1; }
        if (b.dataAsOfUTCUnixTimestamp > a.dataAsOfUTCUnixTimestamp) { return -1; }
        return 0;
    }

    loadingIndicator() {
        if (this.state.isLoading) {
            return (<Spinner animation="border" variant="info" size="sm" className="machine-detail-loading-spinner" />);
        }
    }

    render() {
        return (
            <Container fluid key="machine-detail-container">
                <Row key="machine-detail-back-row">
                    <Col key="machine-detail-back-col" className="machine-detail-back-col">
                        <Link to="/" className="breadcrumb-nav-link">{`${I18n.get('nav.back')}`}</Link>
                    </Col>
                </Row>
                <Row key="machine-detail-header-row">
                    <Col key="machine-detail-header-id">
                        {`${I18n.get('machine.detail.id.label')}`}:&nbsp;
                        {this.state.machineId}{this.loadingIndicator()}
                    </Col>
                </Row>
                <Row key="machine-detail-chart-row">
                    <Col key="machine-detail-chart-col>">
                        <div className="chart-container-div">
                            <canvas ref={this._chartRef}></canvas>
                        </div>

                    </Col>
                </Row>
            </Container>
        );
    }
}
