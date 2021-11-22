// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { API, I18n } from 'aws-amplify';
import { IUpdateMachineNameResponse, IUpdateMachineConfigResponse, updateMachineConfig, updateMachineName } from '../../graphql/mutations';
import { getConfigItem, IGetConfigItemResponse, getUIReferenceItem, IGetUIReferenceItemResponse } from '../../graphql/queries';
import { ReferenceDataTypes, ConfigType, IMachineConfigItem, IMachineReferenceDataItem, MachineStatus } from '../../util/data-structures';
import './MachineStatusCard.css';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Table from 'react-bootstrap/Table';
import Spinner from 'react-bootstrap/Spinner';
import Tooltip from 'react-bootstrap/Tooltip';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import { Link } from 'react-router-dom';
import moment from 'moment';

type MachineStatusCardProps = {
    machine: IMachineReferenceDataItem;
};

type MachineStatusCardState = {
    id: string;
    status: MachineStatus;
    name?: string;
    statusAsOf: string;
    machineStatusUpdatedTimestamp?: number;
    showConfigModal: boolean;
    isLoadingConfig: boolean;
    machineProductionCountTagName: string;
    machineStatusTagName: string;
    machineStatusUpValue: string;
    machineStatusDownValue: string;
    machineStatusIdleValue: string;
    newMachineName: string;
    isMutating: boolean;
    refreshIntervalId?: NodeJS.Timeout;
};

export class MachineStatusCard extends React.Component<MachineStatusCardProps, MachineStatusCardState> {
    private _isMounted = false;
    private readonly REFRESH_INTERVAL = 60 * 1000; // 60 * 1000 = one minute

    constructor(props: MachineStatusCardProps) {
        super(props);
        this.onClickConfig = this.onClickConfig.bind(this);
        this.onCloseConfigModal = this.onCloseConfigModal.bind(this);
        this.onClickConfigModalSaveBtn = this.onClickConfigModalSaveBtn.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.setStatusAsOf = this.setStatusAsOf.bind(this);
        this.state = {
            id: props.machine.id,
            name: props.machine.name,
            status: props.machine.machineStatus || MachineStatus.UNKNOWN,
            machineStatusUpdatedTimestamp: props.machine.machineStatusUpdatedTimestamp,
            statusAsOf: '',
            showConfigModal: false,
            isLoadingConfig: false,
            machineProductionCountTagName: '',
            machineStatusTagName: '',
            machineStatusUpValue: '',
            machineStatusDownValue: '',
            machineStatusIdleValue: '',
            newMachineName: '',
            isMutating: false
        };
    }

    componentDidMount() {
        this._isMounted = true;
        this.setStatusAsOf();
        this.setState({ refreshIntervalId: setInterval(this.setStatusAsOf, this.REFRESH_INTERVAL) });
    }

    componentDidUpdate(prevProps: MachineStatusCardProps) {
        if (!this._isMounted) { return; }
        let propsChanged = (JSON.stringify(this.props) !== JSON.stringify(prevProps));

        if (propsChanged) {
            this.setState({
                id: this.props.machine.id,
                name: this.props.machine.name,
                status: this.props.machine.machineStatus || MachineStatus.UNKNOWN,
                machineStatusUpdatedTimestamp: this.props.machine.machineStatusUpdatedTimestamp
            });

            this.setStatusAsOf();
        }
    }

    componentWillUnmount() {
        this._isMounted = false;
        if (this.state.refreshIntervalId) {
            clearInterval(this.state.refreshIntervalId);
        }
    }

    setStatusAsOf(): void {
        if (!this._isMounted) { return; }

        let statusAsOf = '';
        try {
            if (this.state.status && this.state.status !== MachineStatus.UNKNOWN && this.state.machineStatusUpdatedTimestamp) {
                let statusLabel = I18n.get(`machine.status.${this.state.status.toLowerCase()}`);
                statusAsOf = `${statusLabel} ${I18n.get('machine.status.for')} ${moment.unix(this.state.machineStatusUpdatedTimestamp).fromNow(true)}`
            }
        } catch (err) {
            console.error('Unable to refresh the status as-of timestamp');
        }

        this.setState({ statusAsOf });
    }

    handleChange(event: any) {
        if (!this._isMounted) { return; }

        const formElement = event.currentTarget;

        if (formElement.id) {
            switch (formElement.id) {
                case 'machineProductionCountTagName':
                    this.setState({ machineProductionCountTagName: formElement.value });
                    break
                case 'machineStatusTagName':
                    this.setState({ machineStatusTagName: formElement.value });
                    break;
                case 'machineStatusUpValue':
                    this.setState({ machineStatusUpValue: formElement.value });
                    break;
                case 'machineStatusDownValue':
                    this.setState({ machineStatusDownValue: formElement.value });
                    break;
                case 'machineStatusIdleValue':
                    this.setState({ machineStatusIdleValue: formElement.value });
                    break;
                case 'newMachineName':
                    this.setState({ newMachineName: formElement.value });
                    break;
            }
        }
    }

    async onClickConfig() {
        if (!this._isMounted) { return; }
        this.setState({ showConfigModal: true, isLoadingConfig: true });

        await this.loadMachineConfig();
        await this.loadUIReferenceData();

        this.setState({ isLoadingConfig: false });
    }

    async loadMachineConfig() {
        if (!this._isMounted) { return; }

        const resp = (await API.graphql({
            query: getConfigItem,
            variables: {
                input: {
                    id: this.state.id,
                    type: ConfigType.MACHINE_CONFIG
                }
            }
        }) as IGetConfigItemResponse);

        if (resp && resp.data && resp.data.getConfigItem &&
            resp.data.getConfigItem.id === this.state.id &&
            resp.data.getConfigItem.type === ConfigType.MACHINE_CONFIG) {
            const configItem = resp.data.getConfigItem as IMachineConfigItem;
            this.setState({
                machineProductionCountTagName: configItem.machineProductionCountTagName,
                machineStatusTagName: configItem.machineStatusTagName,
                machineStatusDownValue: configItem.machineStatusDownValue,
                machineStatusUpValue: configItem.machineStatusUpValue,
                machineStatusIdleValue: configItem.machineStatusIdleValue
            });
        } else {
            this.setState({
                machineProductionCountTagName: '',
                machineStatusTagName: '',
                machineStatusDownValue: '',
                machineStatusUpValue: '',
                machineStatusIdleValue: ''
            });
        }
    }

    async loadUIReferenceData() {
        if (!this._isMounted) { return; }

        const resp = (await API.graphql({
            query: getUIReferenceItem,
            variables: {
                input: {
                    id: this.state.id,
                    type: ReferenceDataTypes.MACHINE
                }
            }
        }) as IGetUIReferenceItemResponse);

        if (resp && resp.data && resp.data.getUIReferenceItem &&
            resp.data.getUIReferenceItem.id === this.state.id &&
            resp.data.getUIReferenceItem.type === ReferenceDataTypes.MACHINE) {
            const configItem = resp.data.getUIReferenceItem as IMachineReferenceDataItem;
            this.setState({
                newMachineName: configItem.name || ''
            });
        } else {
            this.setState({
                newMachineName: ''
            });
        }
    }

    onCloseConfigModal() {
        if (!this._isMounted) { return; }
        this.setState({ showConfigModal: false });
    }

    async onClickConfigModalSaveBtn(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        event.stopPropagation();
        if (!this._isMounted) { return; }
        if (this.state.isMutating) { return; }

        try {
            this.setState({
                isMutating: true,
                machineStatusDownValue: this.state.machineStatusDownValue.split(',').map(val => val.trim()).join(','),
                machineStatusIdleValue: this.state.machineStatusIdleValue.split(',').map(val => val.trim()).join(','),
                machineStatusUpValue: this.state.machineStatusUpValue.split(',').map(val => val.trim()).join(',')
            });

            // Update the machine's display name
            const updateMachineNameResponse = (await API.graphql({
                query: updateMachineName, variables: {
                    input: {
                        id: this.state.id,
                        name: this.state.newMachineName
                    }
                }
            }) as IUpdateMachineNameResponse);

            if (!updateMachineNameResponse || !updateMachineNameResponse.data || !updateMachineNameResponse.data.updateMachineName) {
                throw new Error('Updating the UI Reference Data was not successful');
            }

            // Update the machine configuration
            const updateMachineConfigResponse = (await API.graphql({
                query: updateMachineConfig, variables: {
                    input: {
                        id: this.state.id,
                        machineProductionCountTagName: this.state.machineProductionCountTagName,
                        machineStatusTagName: this.state.machineStatusTagName,
                        machineStatusUpValue: this.state.machineStatusUpValue,
                        machineStatusDownValue: this.state.machineStatusDownValue,
                        machineStatusIdleValue: this.state.machineStatusIdleValue
                    }
                }
            }) as IUpdateMachineConfigResponse);

            if (!updateMachineConfigResponse || !updateMachineConfigResponse.data || !updateMachineConfigResponse.data.updateMachineConfig) {
                throw new Error('Updating the machine config was not successful');
            }

            this.setState({ isMutating: false });
            this.onCloseConfigModal();
        } catch (err) {
            console.error(err);
            this.setState({ isMutating: false });
        }
    }

    showModalBody() {
        if (this.state.isLoadingConfig) {
            return (
                <Modal.Body>
                    <div>{`${I18n.get('modal.configureMachine.loading')}`}</div>
                    <Spinner animation="border" variant="info" />
                </Modal.Body>
            );
        }

        const renderTooltip = (props: any) => (
            <Tooltip id="map-status-value-tooltip" {...props}>
                {`${I18n.get('modal.configureMachine.mapStatusValueHeaderTooltipText')}`}
            </Tooltip>
        );

        return (
            <Form noValidate onSubmit={this.onClickConfigModalSaveBtn}>
                <Modal.Body>
                    <Form.Row>
                        <Col>
                            <Form.Group controlId="machineProductionCountTagName">
                                <Form.Label><strong>{`${I18n.get('modal.configureMachine.prodCountLabel')}`}</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    disabled={this.state.isMutating}
                                    placeholder={`${I18n.get('modal.configureMachine.tagNamePlaceholder')}`}
                                    value={this.state.machineProductionCountTagName} onChange={this.handleChange}
                                />
                            </Form.Group>
                        </Col>
                    </Form.Row>
                    <Form.Row>
                        <Col>
                            <Form.Group controlId="machineStatusTagName">
                                <Form.Label><strong>{`${I18n.get('modal.configureMachine.statusLabel')}`}</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    disabled={this.state.isMutating}
                                    placeholder={`${I18n.get('modal.configureMachine.tagNamePlaceholder')}`}
                                    value={this.state.machineStatusTagName} onChange={this.handleChange}
                                />
                            </Form.Group>
                        </Col>
                    </Form.Row>
                    <Form.Row>
                        <Col>
                            <div><strong>{`${I18n.get('modal.configureMachine.mapStatusLabel')}`}</strong></div>
                            <Table bordered size="sm" className="map-status-value-table">
                                <thead>
                                    <tr>
                                        <td>{`${I18n.get('modal.configureMachine.mapStatusLabelHeader')}`}</td>
                                        <td>
                                            {`${I18n.get('modal.configureMachine.mapStatusValueHeader')}`}
                                            <OverlayTrigger placement="top-start" overlay={renderTooltip}>
                                                <span className="map-status-value-header-tooltip">
                                                    <i className="map-status-value-info-icon bi-info-circle-fill"></i>
                                                </span>
                                            </OverlayTrigger>
                                        </td>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><Form.Label>{`${I18n.get('modal.configureMachine.upValueLabel')}`}</Form.Label></td>
                                        <td>
                                            <Form.Group controlId="machineStatusUpValue">
                                                <Form.Control
                                                    type="text"
                                                    disabled={this.state.isMutating}
                                                    placeholder={`${I18n.get('modal.configureMachine.upValuePlaceholder')}`}
                                                    value={this.state.machineStatusUpValue} onChange={this.handleChange}
                                                />
                                            </Form.Group>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><Form.Label>{`${I18n.get('modal.configureMachine.downValueLabel')}`}</Form.Label></td>
                                        <td>
                                            <Form.Group controlId="machineStatusDownValue">
                                                <Form.Control
                                                    type="text"
                                                    disabled={this.state.isMutating}
                                                    placeholder={`${I18n.get('modal.configureMachine.downValuePlaceholder')}`}
                                                    value={this.state.machineStatusDownValue} onChange={this.handleChange}
                                                />
                                            </Form.Group>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><Form.Label>{`${I18n.get('modal.configureMachine.idleValueLabel')}`}</Form.Label></td>
                                        <td>
                                            <Form.Group controlId="machineStatusIdleValue">
                                                <Form.Control
                                                    type="text"
                                                    disabled={this.state.isMutating}
                                                    placeholder={`${I18n.get('modal.configureMachine.idleValuePlaceholder')}`}
                                                    value={this.state.machineStatusIdleValue} onChange={this.handleChange}
                                                />
                                            </Form.Group>
                                        </td>
                                    </tr>
                                </tbody>
                            </Table>
                        </Col>
                    </Form.Row>
                    <Form.Row>
                        <Col>
                            <Form.Group controlId="newMachineName">
                                <Form.Label><strong>{`${I18n.get('modal.configureMachine.machineNameLabel')}`}</strong></Form.Label>
                                <Form.Control
                                    type="text"
                                    disabled={this.state.isMutating}
                                    placeholder={`${I18n.get('modal.configureMachine.machineNamePlaceholder')}`}
                                    value={this.state.newMachineName} onChange={this.handleChange}
                                />
                            </Form.Group>
                        </Col>
                    </Form.Row>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" disabled={this.state.isMutating} onClick={this.onCloseConfigModal}>{this.state.isMutating ? `${I18n.get('button.updating')}` : `${I18n.get('button.cancel')}`}</Button>
                    <Button variant="success" disabled={this.state.isMutating} type="submit">{this.state.isMutating ? `${I18n.get('button.updating')}` : `${I18n.get('button.save')}`}</Button>
                </Modal.Footer>
            </Form>
        );
    }

    render() {
        return (
            <>
                <Card className={`machine-status-card ${this.state.status}`} key={this.state.id} style={{ width: '10rem', height: '10rem' }}>
                    <div>
                        <Button onClick={this.onClickConfig} variant="light" size="lg" className="config-button">
                            <i className="config-button-icon bi-three-dots-vertical"></i>
                        </Button>
                    </div>
                    <Link to={`/machine-detail/${btoa(this.state.id)}`} className="machine-detail-link">
                        <Card.Body>
                            <Card.Title className="machine-title">
                                {this.state.name || this.state.id.split('/').join(' / ')}
                            </Card.Title>
                            <Card.Text className="machine-card-text">{this.state.statusAsOf}</Card.Text>
                        </Card.Body>
                    </Link>
                </Card>
                <Modal show={this.state.showConfigModal} onHide={this.onCloseConfigModal} centered animation={false}>
                    <Modal.Header>
                        <Container fluid>
                            <Row><strong>{`${I18n.get('modal.configureMachine.title')}`}</strong></Row>
                            <Row><small className="text-muted">{`${I18n.get('modal.configureMachine.uniqueMachineIdLabel')}`}: {this.state.id}</small></Row>
                        </Container>
                    </Modal.Header>
                    {this.showModalBody()}
                </Modal>
            </>
        );
    }
}
