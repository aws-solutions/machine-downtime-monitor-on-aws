// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import './LineRow.css';
import { I18n } from 'aws-amplify';
import { IMachineReferenceDataItem, ILineReferenceDataItem, MachineStatus } from '../../util/data-structures';
import { MachineStatusCard } from '../machines/MachineStatusCard';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';

type LineRowProps = {
    locationId: string;
    line?: ILineReferenceDataItem;
    machines: IMachineReferenceDataItem[];
};

type LineRowState = {
    locationId: string;
    lineDisplayName: string;
    machines: IMachineReferenceDataItem[];
};

export class LineRow extends React.Component<LineRowProps, LineRowState> {
    constructor(props: LineRowProps) {
        super(props);
        this.state = {
            locationId: props.locationId,
            lineDisplayName: props.line ? (props.line.name || props.line.id) : 'Unknown Line',
            machines: props.machines || []
        };
    }

    componentDidUpdate(prevProps: LineRowProps) {
        let propsChanged = (JSON.stringify(this.props) !== JSON.stringify(prevProps));

        if (propsChanged) {
            this.setState({
                ...this.state,
                locationId: this.props.locationId,
                lineDisplayName: this.props.line ? (this.props.line.name || this.props.line.id) : 'Unknown Line',
                machines: [...this.props.machines]
            });
        }
    }

    getOverallLineStatus(): string {
        const numberUp = this.state.machines.filter(machine => (machine.machineStatus === MachineStatus.UP || machine.machineStatus === MachineStatus.IDLE)).length;
        return `${numberUp} ${I18n.get('lineStatus.outOf')} ${this.state.machines.length} ${I18n.get('lineStatus.availableMachines')}`;
    }

    render() {
        return (
            <Container fluid className="line-container" key={`container-${this.state.locationId}-${this.state.lineDisplayName}`}>
                <Row key={`line-row-${this.state.lineDisplayName}`}>
                    <Col xs lg="2" key={`line-status-col-${this.state.locationId}-${this.state.lineDisplayName}`}>
                        <Card style={{ height: '10rem' }} id={`${this.state.lineDisplayName}-card`}>
                            <Card.Body>
                                <Card.Title>{this.state.lineDisplayName}</Card.Title>
                                <Card.Text>{this.getOverallLineStatus()}</Card.Text>
                            </Card.Body>
                        </Card>
                    </Col>
                    {this.state.machines.map(
                        (machine) => (
                            <Col xs="auto" md="auto" lg="auto" xl="auto" key={`line-machines-col-${machine.id}`} className="machine-card-col">
                                <MachineStatusCard machine={machine}></MachineStatusCard>
                            </Col>
                        ))}
                </Row>
            </Container>
        );
    }
}
